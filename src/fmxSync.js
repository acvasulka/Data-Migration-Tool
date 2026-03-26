import { getFmxReferenceCache, saveFmxReferenceCache, getCacheAge } from './db';

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
    const { customFields, systemFields } = await fetchPostOptions(siteUrl, email, password, schemaType, modules);

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, customFields, systemFields);
    }

    return { customFields, systemFields, fromCache: false };
  } catch {
    return { customFields: [], systemFields: [], fromCache: false };
  }
}
