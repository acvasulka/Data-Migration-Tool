import { getFmxReferenceCache, saveFmxReferenceCache, getCacheAge } from './db';
import { getLookupConfig, isLookupField, CROSS_SHEET_MAP, inferFieldGroup, inferFieldType } from './fmxLookupRegistry';
import { getFieldTypeCategory } from './fmxFieldTypes';

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

// ── Endpoint resolution ─────────────────────────────────────────────────────

function resolvePostOptionsEndpoint(schemaType, modules) {
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

// ── Module normalization ────────────────────────────────────────────────────

export function normalizeModules(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.workRequestModules) && Array.isArray(raw.workTaskModules)) return raw;
  if (Array.isArray(raw.workRequestModules)) {
    return { ...raw, workTaskModules: [{ slug: 'maintenance', label: 'Maintenance' }] };
  }
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  return {
    workRequestModules:    [{ slug: raw.workRequest || 'maintenance', label: cap(raw.workRequest || 'maintenance') }],
    scheduleRequestModules: [{ slug: raw.scheduling  || 'scheduling',  label: cap(raw.scheduling  || 'scheduling')  }],
    workTaskModules:       [{ slug: raw.workTask    || 'maintenance', label: cap(raw.workTask    || 'maintenance')  }],
  };
}

export function mergeModules(existing, fresh) {
  const mergeList = (existingList = [], freshList = []) => {
    const freshMap  = new Map(freshList.map(m => [m.slug, m]));
    const existingSlugs = new Set(existingList.map(m => m.slug));
    const result = [];
    for (const m of existingList) {
      if (freshMap.has(m.slug)) {
        result.push({ slug: m.slug, label: freshMap.get(m.slug).label });
      } else {
        result.push({ slug: m.slug, label: m.label, disabled: true });
      }
    }
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

// ── Endpoint maps ───────────────────────────────────────────────────────────

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
  'Building':               '/v1/buildings/get-options',
  'Equipment':              '/v1/equipment/get-options',
  'Inventory':              '/v1/inventory/get-options',
  'Resource':               '/v1/resources/get-options',
  'User':                   '/v1/users/get-options',
  'Equipment Type':         '/v1/equipment-types/get-options',
  'Work Request':           (m) => `/v1/${m?.workRequest || 'maintenance'}-requests/get-options`,
  'Schedule Request':       (m) => `/v1/${m?.scheduling || 'scheduling'}/requests/get-options`,
  'Work Task':              (m) => `/v1/${m?.workTask || 'maintenance'}/tasks/get-options`,
  'Transportation Request': '/v1/transportation-requests/get-options',
  'Accounting Account':     '/v1/accounting-accounts/get-options',
};

// ── Fetch post-options (field definitions) ──────────────────────────────────

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
        options: cf.options || [],
        allowMultipleSelections: cf.allowMultipleSelections || false,
        allowOtherOption: cf.allowOtherOption || false,
        description: cf.description || '',
        allowMultipleLines: cf.allowMultipleLines || false,
        disallowNegativeValues: cf.disallowNegativeValues || false,
        defaults: cf.defaults || [],
      }));

    const systemFields = (data.systemFields || []).map(sf => ({
      key: sf.key,
      label: sf.label,
      isRequired: sf.isRequired || false,
      isPermitted: sf.isPermitted !== false,
      options: sf.options || null,
      minimumLength: sf.minimumLength || null,
      maximumLength: sf.maximumLength || null,
      minimumValue: sf.minimumValue || null,
      maximumValue: sf.maximumValue || null,
      defaultValue: sf.defaultValue || null,
      documentation: sf.documentation || null,
    }));

    console.log('System fields found:', systemFields.length, '| Custom fields found:', customFields.length);
    return { customFields, systemFields };
  } catch {
    return { customFields: [], systemFields: [] };
  }
}

// ── Fetch get-options (reference value maps) ────────────────────────────────

async function fetchGetOptions(siteUrl, email, password, schemaType, modules) {
  const endpoint = resolveGetOptionsEndpoint(schemaType, modules);
  if (!endpoint) return {};

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
    if (!res.ok) return {};
    const data = await res.json();
    console.log('FMX get-options response:', data);
    return data;
  } catch {
    return {};
  }
}

// ── Build field list from post-options ──────────────────────────────────────

export function buildFieldListFromPostOptions(systemFields, customFields) {
  const fields = [];

  // System fields — filter to permitted only
  for (const sf of systemFields) {
    if (!sf.isPermitted) continue;
    fields.push({
      name: sf.label,
      apiKey: sf.key,
      required: sf.isRequired,
      type: inferFieldType(sf.key),
      group: inferFieldGroup(sf.key),
      crossSheet: CROSS_SHEET_MAP[sf.key] || null,
      isLookupField: isLookupField(sf.key),
      lookupConfig: getLookupConfig(sf.key),
      options: sf.options,
      minLength: sf.minimumLength,
      maxLength: sf.maximumLength,
      minValue: sf.minimumValue,
      maxValue: sf.maximumValue,
      documentation: sf.documentation,
    });
  }

  // Custom fields
  for (const cf of customFields) {
    fields.push({
      name: cf.name,
      required: cf.isRequired,
      type: getFieldTypeCategory(cf.fieldType),
      group: 'FMX Custom Fields',
      isCustomField: true,
      customFieldId: cf.id,
      fieldType: cf.fieldType,
      options: cf.options,
      allowMultipleSelections: cf.allowMultipleSelections,
      description: cf.description,
    });
  }

  return fields;
}

// ── Build ID map from get-options ───────────────────────────────────────────

// Converts the get-options response into a pre-built ID cache.
// Returns: { "Building:Main Campus": 1, "Request Type:Plumbing": 10, ... }
// The cache key format matches what fmxTransform.js expects: "fieldDisplayName:value"
export function buildIdMapFromGetOptions(getOptionsData, fieldList) {
  const idMap = {};
  if (!getOptionsData || !fieldList) return idMap;

  for (const field of fieldList) {
    if (!field.isLookupField || !field.lookupConfig) continue;
    const optionsKey = field.lookupConfig.getOptionsKey;
    if (!optionsKey) continue;

    const optionsMap = getOptionsData[optionsKey];
    if (!optionsMap || typeof optionsMap !== 'object') continue;

    // optionsMap is { id: displayName } — invert to build name→id cache
    for (const [id, displayName] of Object.entries(optionsMap)) {
      const cacheKey = `${field.name}:${displayName}`;
      idMap[cacheKey] = parseInt(id, 10);
    }
  }

  return idMap;
}

// ── Fetch modules ───────────────────────────────────────────────────────────

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

    const wrSettings = data.workRequestSettings || [];
    if (Array.isArray(wrSettings) && wrSettings.length > 0) {
      modules.workRequestModules = wrSettings.map(m => ({
        slug:  m.moduleKey,
        label: m.moduleName,
      }));
    }

    const srSettings = data.scheduleRequestSettings;
    if (srSettings?.moduleKey) {
      modules.scheduleRequestModules = [{ slug: srSettings.moduleKey, label: srSettings.moduleName }];
    }

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

// ── Main sync entry point ───────────────────────────────────────────────────

export async function syncFmxDataForProject(project, schemaType, forceRefresh = false) {
  console.log('FMX sync triggered for:', schemaType);
  console.log('Has credentials:', !!project?.fmx_credentials, '| Has site URL:', !!project?.fmx_site_url);
  if (!project?.fmx_credentials || !project?.fmx_site_url) {
    return { customFields: [], systemFields: [], fields: [], getOptionsData: {}, idMap: {}, fromCache: false };
  }

  const projectId = project.id;
  const modules = project.fmx_modules || {};

  // Check cache first (24h TTL)
  if (projectId && !forceRefresh) {
    const age = await getCacheAge(projectId, schemaType);
    if (age < 24) {
      const cached = await getFmxReferenceCache(projectId, schemaType);
      if (cached?.extra?.customFields && cached?.extra?.systemFields) {
        const customFields = cached.extra.customFields;
        const systemFields = cached.extra.systemFields;
        const getOptionsData = cached.extra.getOptionsData || {};
        const fields = buildFieldListFromPostOptions(systemFields, customFields);
        const idMap = buildIdMapFromGetOptions(getOptionsData, fields);
        return { customFields, systemFields, fields, getOptionsData, idMap, fromCache: true };
      }
    }
  }

  const { email, password } = decodeCredentials(project.fmx_credentials);
  const siteUrl = project.fmx_site_url;

  try {
    // Fetch post-options and get-options in parallel
    const [postOpts, getOpts] = await Promise.all([
      fetchPostOptions(siteUrl, email, password, schemaType, modules),
      fetchGetOptions(siteUrl, email, password, schemaType, modules),
    ]);

    const { customFields, systemFields } = postOpts;
    const getOptionsData = getOpts;

    const fields = buildFieldListFromPostOptions(systemFields, customFields);
    const idMap = buildIdMapFromGetOptions(getOptionsData, fields);

    if (projectId) {
      await saveFmxReferenceCache(projectId, schemaType, customFields, systemFields, getOptionsData);
    }

    return { customFields, systemFields, fields, getOptionsData, idMap, fromCache: false };
  } catch {
    return { customFields: [], systemFields: [], fields: [], getOptionsData: {}, idMap: {}, fromCache: false };
  }
}
