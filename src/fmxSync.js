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

const SCHEMA_ENDPOINTS = {
  'Building':  '/v1/buildings',
  'Equipment': '/v1/equipment',
  'Inventory': '/v1/inventory',
  'Resource':  '/v1/resources',
  'User':      '/v1/users',
  // Equipment Type has no custom fields — intentionally omitted
};

async function fetchCustomFields(siteUrl, email, password, schemaType) {
  const endpoint = SCHEMA_ENDPOINTS[schemaType];
  if (!endpoint) return []; // e.g. Equipment Type — not supported

  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl, email, password,
        endpoint: `${endpoint}?fields=:default,customFields&limit=1`,
        method: 'GET', payload: null,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    console.log('FMX sync response:', data);

    const items = data.items || data.results || (Array.isArray(data) ? data : []);
    if (items.length === 0 || !items[0].customFields) return [];

    const customFields = items[0].customFields
      .filter(cf => cf.customFieldID && (cf.name || cf.displayName))
      .map(cf => ({
        id: cf.customFieldID,
        name: cf.name || cf.displayName,
        fieldType: cf.fieldType || 'text',
      }));

    console.log('Custom fields found:', customFields);
    return customFields;
  } catch {
    return [];
  }
}

// Main sync entry point — takes full project object and schemaType string
export async function syncFmxDataForProject(project, schemaType, forceRefresh = false) {
  console.log('FMX sync triggered for:', schemaType);
  console.log('Has credentials:', !!project?.fmx_credentials, '| Has site URL:', !!project?.fmx_site_url);
  if (!project?.fmx_credentials || !project?.fmx_site_url) {
    return { customFields: [], fromCache: false };
  }

  const projectId = project.id;

  // Check cache first (24h TTL)
  if (projectId && !forceRefresh) {
    const age = await getCacheAge(projectId, schemaType);
    if (age < 24) {
      const cached = await getFmxReferenceCache(projectId, schemaType);
      if (cached?.extra?.customFields) {
        const customFields = cached.extra.customFields.map(cf => ({
          id: cf.id,
          name: cf.name,
          fieldType: cf.fieldType || 'text',
        }));
        return { customFields, fromCache: true };
      }
    }
  }

  const { email, password } = decodeCredentials(project.fmx_credentials);
  const siteUrl = project.fmx_site_url;

  try {
    const customFields = await fetchCustomFields(siteUrl, email, password, schemaType);

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, customFields);
    }

    return { customFields, fromCache: false };
  } catch {
    return { customFields: [], fromCache: false };
  }
}
