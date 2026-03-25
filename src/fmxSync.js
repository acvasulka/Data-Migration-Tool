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

const ENTITY_MAP = {
  'Building': 'building',
  'Equipment': 'equipment',
  'Equipment Type': 'equipment-type',
  'Resource': 'resource',
  'User': 'user',
  'Inventory': 'inventory',
};

async function fetchCustomFields(siteUrl, email, password, schemaType) {
  const entity = ENTITY_MAP[schemaType];
  if (!entity) return [];
  try {
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl, email, password,
        endpoint: `/v1/custom-fields?entity=${entity}`,
        method: 'GET', payload: null,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
    return items
      .map(cf => ({ id: cf.id, name: cf.name || cf.label, type: cf.type || 'text' }))
      .filter(cf => cf.id && cf.name);
  } catch {
    return [];
  }
}

// Main sync entry point — takes full project object and schemaType string
export async function syncFmxDataForProject(project, schemaType, forceRefresh = false) {
  if (!project?.fmx_credentials || !project?.fmx_site_url) {
    return { customFields: [], fromCache: false };
  }

  const projectId = project.id;

  // Check cache first (24h TTL)
  if (projectId && !forceRefresh) {
    const age = await getCacheAge(projectId, schemaType);
    if (age < 24) {
      const cached = await getFmxReferenceCache(projectId, schemaType);
      if (cached?.data) {
        return { ...cached.data, fromCache: true };
      }
    }
  }

  const { email, password } = decodeCredentials(project.fmx_credentials);
  const siteUrl = project.fmx_site_url;

  try {
    const customFields = await fetchCustomFields(siteUrl, email, password, schemaType);
    const result = { customFields, fromCache: false };

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, result);
    }

    return result;
  } catch {
    return { customFields: [], fromCache: false };
  }
}
