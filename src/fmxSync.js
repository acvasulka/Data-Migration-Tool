import { getFmxReferenceCache, saveFmxReferenceCache, getCacheAge, saveDependencyCache } from './db';
import { fmxFetch } from './apiClient';
import { resolvePostOptionsEndpoint, resolveGetOptionsEndpoint } from './fmxEndpoints';

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
    const res = await fmxFetch({
      siteUrl: siteUrl.trim(), email: email.trim(), password,
      endpoint: '/v1/buildings?limit=1', method: 'GET',
    });
    if (res.ok || res.status === 200) {
      return { success: true, message: `Connected to ${siteUrl.trim()}` };
    }
    return { success: false, message: `Connection failed (${res.status}) — check URL and credentials` };
  } catch {
    return { success: false, message: 'Connection failed — check URL and credentials' };
  }
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

async function fetchPostOptions(siteUrl, email, password, schemaType, modules) {
  const endpoint = resolvePostOptionsEndpoint(schemaType, modules);
  if (!endpoint) return { customFields: [], systemFields: [] };

  try {
    const res = await fmxFetch({ siteUrl, email, password, endpoint, method: 'GET' });
    if (!res.ok) return { customFields: [], systemFields: [] };
    const data = await res.json();

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

    return { customFields, systemFields };
  } catch {
    return { customFields: [], systemFields: [] };
  }
}

async function fetchGetOptions(siteUrl, email, password, schemaType, modules) {
  const endpoint = resolveGetOptionsEndpoint(schemaType, modules);
  if (!endpoint) return { customFields: [] };

  try {
    const res = await fmxFetch({ siteUrl, email, password, endpoint, method: 'GET' });
    if (!res.ok) return { customFields: [] };
    const data = await res.json();

    console.log('[FMX get-options] raw response for', schemaType, '→ keys:', Object.keys(data), 'customFields sample:', JSON.stringify((data.customFields || []).slice(0, 2)));

    const customFields = (data.customFields || [])
      .filter(cf => cf.key || cf.id || cf.customFieldID)
      .map(cf => ({
        id: cf.key || cf.id || cf.customFieldID,
        name: cf.label || cf.name || cf.displayName || `Custom Field ${cf.key || cf.id}`,
        fieldType: cf.fieldTypeName || cf.fieldType || 'Text',
        isRequired: cf.isRequired || false,
      }));

    console.log('[FMX get-options] parsed', customFields.length, 'custom fields');

    return { customFields, raw: data };
  } catch (e) {
    console.warn('[FMX get-options] fetch failed:', e);
    return { customFields: [] };
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
    const res = await fmxFetch({
      siteUrl: siteUrl.trim(), email: email.trim(), password,
      endpoint: '/v1/organization', method: 'GET',
    });
    if (!res.ok) return defaults;
    const data = await res.json();

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
  } catch {
    return defaults;
  }
}

// Main sync entry point — takes full project object and schemaType string
export async function syncFmxDataForProject(project, schemaType, forceRefresh = false) {
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
    // Fetch both /post-options (system field metadata) and /get-options (custom fields + dep values) in parallel
    const [postOpts, getOpts] = await Promise.all([
      fetchPostOptions(siteUrl, email, password, schemaType, modules),
      fetchGetOptions(siteUrl, email, password, schemaType, modules),
    ]);

    const { systemFields } = postOpts;

    // Merge custom fields: prefer /get-options (has actual IDs needed for POST payload),
    // fall back to /post-options if /get-options returned nothing.
    const customFields = getOpts.customFields.length > 0
      ? getOpts.customFields
      : postOpts.customFields;

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, customFields, systemFields);
    }

    return { customFields, systemFields, fromCache: false };
  } catch {
    return { customFields: [], systemFields: [], fromCache: false };
  }
}

// --- Dependency update system ---

export const DEPENDENCY_TYPES = [
  { key: 'buildings',       endpoint: '/v1/buildings',        label: 'Buildings',             nameField: 'name' },
  { key: 'resources',       endpoint: '/v1/resources',        label: 'Resources & Locations', nameField: 'name' },
  { key: 'users',           endpoint: '/v1/users',            label: 'Users',                 nameField: 'name', extraFields: ['email'] },
  { key: 'equipment-types', endpoint: '/v1/equipment-types',  label: 'Equipment Types',       nameField: 'name' },
  { key: 'equipment',       endpoint: '/v1/equipment',        label: 'Equipment Names',       nameField: 'tag' },
  { key: 'inventory-types', endpoint: '/v1/inventory-types',  label: 'Inventory Types',       nameField: 'name' },
  { key: 'inventory',       endpoint: '/v1/inventory',        label: 'Inventory Names',       nameField: 'name' },
  { key: 'request-types',   endpoint: '/v1/request-types',    label: 'Request Types',         nameField: 'name' },
  { key: 'user-types',      endpoint: '/v1/user-types',       label: 'User Types',            nameField: 'name' },
];

// Generic paginated fetcher — collects all pages from an FMX list endpoint.
async function fetchAllPages(siteUrl, email, password, endpoint, fields = 'id,name', limit = 100) {
  const allItems = [];
  let offset = 0;
  let totalCount = null;

  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${sep}offset=${offset}&limit=${limit}&fields=${encodeURIComponent(fields)}`;
    const res = await fmxFetch({ siteUrl, email, password, endpoint: url, method: 'GET' });
    if (!res.ok) throw new Error(`FMX returned ${res.status} for ${endpoint}`);

    const headerTotal = res.headers.get('FMX-Total-Count');
    if (headerTotal !== null && totalCount === null) {
      totalCount = parseInt(headerTotal, 10);
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
    allItems.push(...items);

    if (items.length < limit) break;        // last page
    if (totalCount !== null && allItems.length >= totalCount) break;
    offset += limit;
  }

  return { items: allItems, totalCount: totalCount ?? allItems.length };
}

// Which dep keys each schema base type needs for cross-field validation.
// null = not in map = fetch all (safe default for unknown types).
const SCHEMA_DEP_KEYS = {
  'Building':               [],
  'Resource':               ['buildings'],
  'User':                   ['buildings', 'user-types'],
  'Equipment Type':         [],
  'Equipment':              ['buildings', 'equipment-types'],
  'Inventory Type':         [],
  'Inventory':              ['buildings', 'inventory-types'],
  'Work Request':           ['buildings', 'users', 'resources', 'request-types'],
  'Schedule Request':       ['buildings', 'resources'],
  'Work Task':              ['buildings', 'users', 'equipment'],
  'Transportation Request': ['buildings', 'resources'],
  'Accounting Account':     [],
};

/** Returns the dep keys needed for a given schema type, or null if unknown (fetch all). */
export function getDepKeysForSchema(schemaType) {
  if (!schemaType) return null;
  const base = schemaType.indexOf(':') === -1 ? schemaType : schemaType.slice(0, schemaType.indexOf(':'));
  const keys = SCHEMA_DEP_KEYS[base];
  return Array.isArray(keys) ? keys : null; // null = unknown type → fetch all
}

// Fetch dependencies for a project in parallel.
// depKeys: optional string[] to limit which types are fetched (schema-aware auto-sync).
// Calls onTypeProgress(depKey, 'done'|'error', count) as each type completes.
export async function fetchAllDependencies(project, onTypeProgress, depKeys = null) {
  if (!project?.fmx_credentials || !project?.fmx_site_url) {
    throw new Error('Missing FMX credentials');
  }

  const { email, password } = decodeCredentials(project.fmx_credentials);
  const siteUrl = project.fmx_site_url;
  const projectId = project.id;

  // Filter to only the requested types; if depKeys is empty array, nothing to fetch
  const depsToFetch = depKeys === null
    ? DEPENDENCY_TYPES
    : DEPENDENCY_TYPES.filter(d => depKeys.includes(d.key));

  if (depsToFetch.length === 0) return {};

  const settled = await Promise.allSettled(
    depsToFetch.map(async dep => {
      try {
        const fields = ['id', dep.nameField, ...(dep.extraFields || [])].join(',');
        const { items, totalCount } = await fetchAllPages(siteUrl, email, password, dep.endpoint, fields);

        const cleaned = items.map(item => {
          const entry = { id: item.id, name: item[dep.nameField] };
          for (const ef of (dep.extraFields || [])) entry[ef] = item[ef];
          return entry;
        });

        await saveDependencyCache(projectId, dep.key, cleaned, totalCount);
        if (onTypeProgress) onTypeProgress(dep.key, 'done', totalCount);
        return { key: dep.key, count: totalCount, status: 'done' };
      } catch (e) {
        console.warn(`Failed to fetch dependency "${dep.key}":`, e);
        if (onTypeProgress) onTypeProgress(dep.key, 'error', 0);
        return { key: dep.key, count: 0, status: 'error', error: e.message };
      }
    })
  );

  const results = {};
  for (const r of settled) {
    if (r.status === 'fulfilled') results[r.value.key] = r.value;
  }
  return results;
}
