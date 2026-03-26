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

// Resolve post-options endpoint — handles both static strings and module-based functions
function resolvePostOptionsEndpoint(schemaType, modules) {
  const ep = POST_OPTIONS_ENDPOINTS[schemaType];
  if (!ep) return null;
  return typeof ep === 'function' ? ep(modules) : ep;
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

// Auto-fetch module names from the FMX organization endpoint.
// Returns { workRequest, scheduling, workTask } slug strings.
// Falls back to defaults if the org endpoint doesn't expose module info.
export async function fetchFmxModules(siteUrl, email, password) {
  const defaults = { workRequest: 'maintenance', scheduling: 'scheduling', workTask: 'maintenance' };
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

    // Parse work request modules — FMX returns an array of module configs
    const modules = { ...defaults };

    // Try workRequestModules or similar keys
    const wrModules = data.workRequestModules || data.modules || [];
    if (Array.isArray(wrModules) && wrModules.length > 0) {
      // Use the first enabled work request module's URL slug/name
      const firstEnabled = wrModules.find(m => m.isEnabled !== false) || wrModules[0];
      if (firstEnabled?.urlSlug || firstEnabled?.name) {
        modules.workRequest = (firstEnabled.urlSlug || firstEnabled.name).toLowerCase();
        modules.workTask = modules.workRequest; // work tasks share the same module
      }
    }

    // Try scheduling module name
    const schedModule = data.schedulingModule || data.scheduleRequestModule;
    if (schedModule?.urlSlug || schedModule?.name) {
      modules.scheduling = (schedModule.urlSlug || schedModule.name).toLowerCase();
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
