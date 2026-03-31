import { getFmxReferenceCache, saveFmxReferenceCache, getCacheAge, saveDependencyCache } from './db';
import { FMX_FIELD_ENRICHMENTS } from './fmxFieldMetadata';
import { getBaseSchemaType } from './schemas';

export function encodeCredentials(email, password) {
  return btoa(`${email}:${password}`);
}

export function decodeCredentials(encoded) {
  try {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(':');
    if (idx === -1) return { email: '', password: '' };
    return { email: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return { email: '', password: '' };
  }
}

export async function testFmxConnection(siteUrl, email, password) {
  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl: siteUrl.trim(), email: email.trim(), password,
        endpoint: '/v1/buildings?limit=1',
        method: 'GET', payload: null,
      }),
    });
    if (res.ok || res.status === 200) {
      return { success: true, message: `Connected to ${siteUrl.trim()}` };
    }
    return { success: false, message: `Connection failed (${res.status}) — check URL and credentials` };
  } catch {
    return { success: false, message: 'Connection failed — check URL and credentials' };
  }
}

// Resolve post-options endpoint — handles static strings, module functions, and
// module-qualified schema types like "Work Request:maintenance".
function resolvePostOptionsEndpoint(schemaType, modules) {
  // Module-qualified types carry the slug in the key itself
  if (schemaType.startsWith('Work Request:'))
    return `/v1/${schemaType.split(':')[1]}-requests/post-options`;
  if (schemaType.startsWith('Schedule Request:'))
    return `/v1/${schemaType.split(':')[1]}/requests/post-options`;
  if (schemaType.startsWith('Work Task:'))
    return `/v1/${schemaType.split(':')[1]}/tasks/post-options`;
  const ep = POST_OPTIONS_ENDPOINTS[schemaType];
  if (!ep) return null;
  return typeof ep === 'function' ? ep(modules) : ep;
}

// Convert any fmx_modules shape to the canonical new format:
//   { workRequestModules:[{slug,label}], scheduleRequestModules:[{slug,label}], workTaskModules:[{slug,label}] }
// Handles three cases:
//   1. Already fully-formed new format — pass-through
//   2. New format missing workTaskModules (saved before this fix) — backfill default
//   3. Old flat format { workRequest, scheduling, workTask } — convert to arrays
// Returns null for falsy input.
export function normalizeModules(raw) {
  if (!raw) return null;
  // Already fully-formed
  if (Array.isArray(raw.workRequestModules) && Array.isArray(raw.workTaskModules)) return raw;
  // New format missing workTaskModules (data saved before work-task independence fix)
  if (Array.isArray(raw.workRequestModules)) {
    return { ...raw, workTaskModules: [{ slug: 'maintenance', label: 'Maintenance' }] };
  }
  // Old flat format
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  return {
    workRequestModules:    [{ slug: raw.workRequest || 'maintenance', label: cap(raw.workRequest || 'maintenance') }],
    scheduleRequestModules: [{ slug: raw.scheduling  || 'scheduling',  label: cap(raw.scheduling  || 'scheduling')  }],
    workTaskModules:       [{ slug: raw.workTask    || 'maintenance', label: cap(raw.workTask    || 'maintenance')  }],
  };
}

// Merges a freshly-fetched module list into the existing stored modules.
// Rules:
//   - Existing modules still in fresh → kept active (label updated if changed)
//   - Existing modules NOT in fresh   → marked { ..., disabled: true }
//   - Fresh modules not yet stored    → added as active
// Returns { merged, changed } where `changed` is true only if the result differs from existing.
export function mergeModules(existing, fresh) {
  const mergeList = (existingList = [], freshList = []) => {
    const freshMap  = new Map(freshList.map(m => [m.slug, m]));
    const existingSlugs = new Set(existingList.map(m => m.slug));
    const result = [];

    // Preserve existing order; update active/disabled status
    for (const m of existingList) {
      if (freshMap.has(m.slug)) {
        // Still present — ensure label is current, clear disabled flag
        result.push({ slug: m.slug, label: freshMap.get(m.slug).label });
      } else {
        // Gone from org → mark disabled (keep for history)
        result.push({ slug: m.slug, label: m.label, disabled: true });
      }
    }
    // Append brand-new modules from fresh
    for (const m of freshList) {
      if (!existingSlugs.has(m.slug)) {
        result.push({ slug: m.slug, label: m.label });
      }
    }
    return result;
  };

  const norm = existing || {};
  const merged = {
    workRequestModules:    mergeList(norm.workRequestModules,    fresh.workRequestModules),
    scheduleRequestModules: mergeList(norm.scheduleRequestModules, fresh.scheduleRequestModules),
    workTaskModules:       mergeList(norm.workTaskModules,       fresh.workTaskModules),
  };

  const changed = JSON.stringify(merged) !== JSON.stringify(norm);
  return { merged, changed };
}

const POST_OPTIONS_ENDPOINTS = {
  'Building':               '/v1/buildings/post-options',
  'Equipment':              '/v1/equipment/post-options',
  'Inventory':              '/v1/inventory/post-options',
  'Resource':               '/v1/resources/post-options',
  'User':                   '/v1/users/post-options',
  'Equipment Type':         '/v1/equipment-types/post-options',
  'Work Request':           (m) => `/v1/${m?.workRequest || 'maintenance'}-requests/post-options`,
  'Schedule Request':       (m) => `/v1/${m?.scheduling || 'scheduling'}/requests/post-options`,
  'Work Task':              (m) => `/v1/${m?.workTask || 'maintenance'}/tasks/post-options`,
  'Transportation Request': '/v1/transportation-requests/post-options',
  'Accounting Account':     '/v1/accounting-accounts/post-options',
};

const GET_OPTIONS_ENDPOINTS = {
  'Work Request':           (m) => `/v1/${m?.workRequest || 'maintenance'}-requests/get-options`,
  'Schedule Request':       (m) => `/v1/${m?.scheduling || 'scheduling'}/requests/get-options`,
  'Work Task':              (m) => `/v1/${m?.workTask || 'maintenance'}/tasks/get-options`,
  'Transportation Request': '/v1/transportation-requests/get-options',
};

function resolveGetOptionsEndpoint(schemaType, modules) {
  if (schemaType.startsWith('Work Request:'))
    return `/v1/${schemaType.split(':')[1]}-requests/get-options`;
  if (schemaType.startsWith('Schedule Request:'))
    return `/v1/${schemaType.split(':')[1]}/requests/get-options`;
  if (schemaType.startsWith('Work Task:'))
    return `/v1/${schemaType.split(':')[1]}/tasks/get-options`;
  const ep = GET_OPTIONS_ENDPOINTS[schemaType];
  if (!ep) return null;
  return typeof ep === 'function' ? ep(modules) : ep;
}

// Map GET OPTIONS response keys (camelCase) → dep cache keys (kebab-case)
const GET_OPTS_DEP_PROPS = {
  buildings:     'buildings',
  requestTypes:  'request-types',
  resources:     'resources',
  equipment:     'equipment',
  resourceTypes: 'resource-types',
};

async function fetchGetOptions(siteUrl, email, password, schemaType, modules) {
  const endpoint = resolveGetOptionsEndpoint(schemaType, modules);
  if (!endpoint) return { customFields: [], raw: null, depMaps: {} };

  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl, email, password,
        endpoint,
        method: 'GET', payload: null,
      }),
    });
    if (!res.ok) return { customFields: [], raw: null, depMaps: {} };
    const data = await res.json();
    console.log('FMX get-options response:', data);

    // Extract custom fields from id→name map
    const cfMap = (data.customFields && typeof data.customFields === 'object' && !Array.isArray(data.customFields))
      ? data.customFields : {};
    const customFields = Object.entries(cfMap).map(([id, name]) => ({
      id: parseInt(id, 10),
      name: String(name),
      fieldType: 'Text',
      isRequired: false,
    }));

    // Extract dep maps (buildings, requestTypes, resources, etc.)
    const depMaps = {};
    for (const [prop, cacheKey] of Object.entries(GET_OPTS_DEP_PROPS)) {
      const raw = data[prop];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        depMaps[cacheKey] = Object.entries(raw)
          .map(([id, name]) => ({ id: parseInt(id, 10), name: String(name) }))
          .filter(item => item.id > 0);
      }
    }

    return { customFields, raw: data, depMaps };
  } catch (e) {
    console.warn('[FMX get-options] fetch failed:', e);
    return { customFields: [], raw: null, depMaps: {} };
  }
}

async function fetchPostOptions(siteUrl, email, password, schemaType, modules) {
  const endpoint = resolvePostOptionsEndpoint(schemaType, modules);
  if (!endpoint) return { customFields: [], systemFields: [] };

  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl, email, password,
        endpoint,
        method: 'GET', payload: null,
      }),
    });
    if (!res.ok) return { customFields: [], systemFields: [] };
    const data = await res.json();
    console.log('FMX post-options response:', data);

    const customFields = (data.customFields || [])
      .filter(cf => cf.key && cf.label)
      .map(cf => ({
        id: cf.key,
        name: cf.label,
        fieldType: cf.fieldTypeName,
        isRequired: cf.isRequired || false,
      }));

    const systemFields = (data.systemFields || []).map(sf => ({
      key: sf.key,
      label: sf.label,
      isRequired: sf.isRequired || false,
      isPermitted: sf.isPermitted !== false,
      maximumLength: sf.maximumLength || null,
    }));

    console.log('Custom fields found:', customFields);
    return { customFields, systemFields };
  } catch {
    return { customFields: [], systemFields: [] };
  }
}

// Auto-fetch module arrays from the FMX organization endpoint.
// Returns { workRequestModules, scheduleRequestModules, workTaskModules } each as [{slug,label}].
// Falls back to single-entry defaults if the org endpoint fails or returns no data.
//
// Actual response fields (confirmed from API):
//   data.workRequestSettings    — array,  each has .moduleKey (slug) and .moduleName (label)
//   data.scheduleRequestSettings — object, has .moduleKey and .moduleName
//   data.workTaskSettings       — array,  each has .moduleKey and .moduleName
export async function fetchFmxModules(siteUrl, email, password) {
  const defaults = {
    workRequestModules:    [{ slug: 'maintenance', label: 'Maintenance' }],
    scheduleRequestModules: [{ slug: 'scheduling',  label: 'Scheduling'  }],
    workTaskModules:       [{ slug: 'maintenance', label: 'Maintenance' }],
  };
  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl: siteUrl.trim(), email: email.trim(), password,
        endpoint: '/v1/organization',
        method: 'GET', payload: null,
      }),
    });
    if (!res.ok) return defaults;
    const data = await res.json();
    console.log('FMX organization response:', data);

    const modules = { ...defaults };

    // Work request modules — data.workRequestSettings is an array
    const wrSettings = data.workRequestSettings || [];
    if (Array.isArray(wrSettings) && wrSettings.length > 0) {
      modules.workRequestModules = wrSettings.map(m => ({
        slug:  m.moduleKey,
        label: m.moduleName,
      }));
    }

    // Schedule request — data.scheduleRequestSettings is a single object (not array)
    const srSettings = data.scheduleRequestSettings;
    if (srSettings?.moduleKey) {
      modules.scheduleRequestModules = [{ slug: srSettings.moduleKey, label: srSettings.moduleName }];
    }

    // Work task modules — data.workTaskSettings is an array, independent of work requests
    const wtSettings = data.workTaskSettings || [];
    if (Array.isArray(wtSettings) && wtSettings.length > 0) {
      modules.workTaskModules = wtSettings.map(m => ({
        slug:  m.moduleKey,
        label: m.moduleName,
      }));
    }

    return modules;
  } catch (e) {
    console.warn('fetchFmxModules failed, using defaults:', e);
    return defaults;
  }
}

// Main sync entry point — takes full project object and schemaType string
export async function syncFmxDataForProject(project, schemaType, forceRefresh = false) {
  console.log('FMX sync triggered for:', schemaType);
  console.log('Has credentials:', !!project?.fmx_credentials, '| Has site URL:', !!project?.fmx_site_url);
  if (!project?.fmx_credentials || !project?.fmx_site_url) {
    return { customFields: [], systemFields: [], fromCache: false };
  }

  const projectId = project.id;
  const modules = project.fmx_modules || {};

  // Check cache first (24h TTL)
  if (projectId && !forceRefresh) {
    const age = await getCacheAge(projectId, schemaType);
    if (age < 24) {
      const cached = await getFmxReferenceCache(projectId, schemaType);
      if (cached?.extra?.customFields) {
        const customFields = cached.extra.customFields.map(cf => ({
          id: cf.id,
          name: cf.name,
          fieldType: cf.fieldType,
          isRequired: cf.isRequired || false,
        }));
        const systemFields = cached.extra.systemFields || [];
        return { customFields, systemFields, fromCache: true };
      }
    }
  }

  const { email, password } = decodeCredentials(project.fmx_credentials);
  const siteUrl = project.fmx_site_url;

  try {
    // Fetch both /post-options and /get-options in parallel
    const [postOpts, getOpts] = await Promise.all([
      fetchPostOptions(siteUrl, email, password, schemaType, modules),
      fetchGetOptions(siteUrl, email, password, schemaType, modules),
    ]);

    // Build synthetic fields from GET OPTIONS sortKeys + enrichments.
    // Fields that appear in sortKeys AND have an enrichment entry become mappable
    // system fields even if they're absent from post-options.
    const sortKeys = getOpts.raw?.sortKeys || {};
    const baseType = getBaseSchemaType(schemaType);
    const enrichments = FMX_FIELD_ENRICHMENTS[baseType] || {};
    const existingSystemFieldKeys = new Set(postOpts.systemFields.map(sf => sf.key));

    // 1) SortKey-driven synthetic fields: keys in sortKeys that have a matching enrichment
    const syntheticFields = Object.keys(sortKeys)
      .filter(k => enrichments[k] && !existingSystemFieldKeys.has(k))
      .map(k => ({
        key: k,
        label: enrichments[k].label || sortKeys[k],
        isRequired: false,
        isPermitted: true,
      }));

    // 2) Enrichment-driven synthetic fields: ALL enrichment entries not already covered.
    //    This ensures non-lookup fields like dueDate and date/time fields always appear.
    const syntheticKeys = new Set(syntheticFields.map(s => s.key));
    const enrichmentSyntheticFields = Object.entries(enrichments)
      .filter(([key, enrich]) =>
        enrich.label &&
        !existingSystemFieldKeys.has(key) &&
        !syntheticKeys.has(key)
      )
      .map(([key, enrich]) => ({
        key,
        label: enrich.label,
        isRequired: false,
        isPermitted: true,
      }));

    const systemFields = [...postOpts.systemFields, ...syntheticFields, ...enrichmentSyntheticFields];

    // Merge custom fields: post-options is authoritative, get-options supplements
    const mergedCustomFields = [
      ...postOpts.customFields,
      ...getOpts.customFields.filter(cf => !postOpts.customFields.find(p => p.id === cf.id)),
    ];

    // Save dep maps from GET OPTIONS to dep cache
    if (projectId && getOpts.depMaps) {
      for (const [depKey, items] of Object.entries(getOpts.depMaps)) {
        if (items.length > 0) {
          await saveDependencyCache(projectId, depKey, items, items.length);
        }
      }
    }

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, mergedCustomFields, systemFields);
    }

    return { customFields: mergedCustomFields, systemFields, fromCache: false };
  } catch (e) {
    console.error('syncFmxDataForProject error:', e);
    return { customFields: [], systemFields: [], fromCache: false };
  }
}
