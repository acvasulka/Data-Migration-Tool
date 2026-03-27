import { getFmxReferenceCache, saveFmxReferenceCache, getCacheAge } from './db';
import { fmxFetch } from './apiClient';
import { resolvePostOptionsEndpoint } from './fmxEndpoints';

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
    const { customFields, systemFields } = await fetchPostOptions(siteUrl, email, password, schemaType, modules);

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, customFields, systemFields);
    }

    return { customFields, systemFields, fromCache: false };
  } catch {
    return { customFields: [], systemFields: [], fromCache: false };
  }
}
