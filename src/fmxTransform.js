import { getFieldTypeCategory } from './fmxFieldTypes';
import { getBaseSchemaType, getSchemaModuleSlug } from './schemas';
import { fmxFetch } from './apiClient';
import { fetchAllPages } from './fmxSync';

// Equipment assetCondition is an integer enum in the FMX API
function generateDefaultPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let pw = '';
  for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

const ASSET_CONDITION_MAP = {
  'unknown': 0, 'excellent': 1, 'good': 2, 'fair': 3, 'poor': 4, 'retired': 5,
};

function coerceCustomFieldValue(value, fieldType) {
  if (value === null || value === undefined || value === '') return null;
  const category = getFieldTypeCategory(fieldType);
  switch (category) {
    case 'number': {
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    case 'boolean':
      return value === true || value === 'true' ||
             value === '1' ||
             String(value).toLowerCase() === 'yes';
    case 'date': {
      const d = new Date(value);
      return isNaN(d.getTime()) ? String(value) : d.toISOString();
    }
    case 'string':
    default:
      return String(value);
  }
}

function coerceSystemFieldValue(value, fieldType) {
  if (value === null || value === undefined || value === '') return value;
  switch (fieldType) {
    case 'number': {
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? value : num;
    }
    case 'date': {
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toISOString();
    }
    case 'boolean':
      return value === true || value === 'true' || value === '1' ||
             String(value).toLowerCase() === 'yes';
    default:
      return value;
  }
}

// Transform a mapped row object into the correct FMX API payload shape.
// idCache: { "Building:Main Campus": 42 }
// customFieldIdMap: { "Year Built": 42, "Region": 7 } — maps friendly field name to FMX custom field ID
// customFieldMetadata: [{ id: 42, name: "Year Built", fieldType: "Numeric" }]
export function transformRowToPayload(row, schemaType, idCache = {}, customFieldIdMap = {}, customFieldMetadata = [], fieldMapOverride = null, lookupFieldsOverride = null, fieldTypeMap = {}) {
  const baseType = getBaseSchemaType(schemaType);
  const fieldMap = fieldMapOverride || {};
  const payload = {};
  const customFields = [];
  const droppedFields = [];

  // Build a set of lookup field names so we don't report them as "dropped"
  const effectiveLookups = lookupFieldsOverride || {};
  const lookupFieldNames = new Set(Object.keys(effectiveLookups));

  Object.entries(row).forEach(([fieldName, value]) => {
    if (value === null || value === undefined || value === '') return;

    // Match by friendly name in customFieldIdMap (e.g. "Year Built" → ID 42)
    if (customFieldIdMap[fieldName] !== undefined) {
      const cfId = customFieldIdMap[fieldName];
      const cfMeta = customFieldMetadata.find(cf => cf.id === cfId);

      // Multi-select dropdown: split delimited value into array
      if (cfMeta?.allowMultipleSelections) {
        const parts = String(value).split(/[;,]/).map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          customFields.push({ customFieldID: cfId, values: parts });
        }
      } else {
        const coerced = coerceCustomFieldValue(value, cfMeta?.fieldType);
        if (coerced !== null) {
          customFields.push({ customFieldID: cfId, value: coerced });
        }
      }
      return;
    }

    // Match by legacy key format "customField_42"
    if (fieldName.startsWith('customField_')) {
      const id = parseInt(fieldName.replace('customField_', ''), 10);
      if (!isNaN(id)) {
        const cfMeta = customFieldMetadata.find(cf => cf.id === id);
        const coerced = coerceCustomFieldValue(value, cfMeta?.fieldType);
        if (coerced !== null) {
          customFields.push({ customFieldID: id, value: coerced });
        }
      }
      return;
    }

    // Special handling: Equipment Asset Condition → integer enum
    if (baseType === 'Equipment' && fieldName === 'Asset Condition') {
      const normalized = String(value).toLowerCase().trim();
      const enumVal = ASSET_CONDITION_MAP[normalized];
      if (enumVal !== undefined) {
        payload['assetCondition'] = enumVal;
      } else {
        const parsed = parseInt(value, 10);
        payload['assetCondition'] = isNaN(parsed) ? 0 : parsed;
      }
      return;
    }

    // Standard field
    const apiKey = fieldMap[fieldName];
    if (apiKey) {
      const fType = fieldTypeMap[fieldName];
      payload[apiKey] = fType ? coerceSystemFieldValue(value, fType) : value;
      return;
    }

    // If it's a lookup field, it'll be handled below — don't flag as dropped
    if (lookupFieldNames.has(fieldName)) return;

    // Field matched no path — track for logging
    droppedFields.push(fieldName);
  });

  if (droppedFields.length > 0) {
    console.warn(`[FMX Transform] ${droppedFields.length} unmapped field(s) for ${baseType}:`, droppedFields);
  }

  if (customFields.length > 0) {
    payload.customFields = customFields;
  }

  // Compose dot-notation keys into nested objects
  // e.g. 'schedule.frequency' → payload.schedule = { frequency: ... }
  // e.g. 'firstOccurrenceEventTimeBlock.startDate' → payload.firstOccurrenceEventTimeBlock = { startDate: ... }
  const dotKeys = Object.keys(payload).filter(k => k.includes('.'));
  for (const key of dotKeys) {
    const dotIdx = key.indexOf('.');
    const parent = key.slice(0, dotIdx);
    const child = key.slice(dotIdx + 1);
    if (!payload[parent] || typeof payload[parent] !== 'object') payload[parent] = {};
    payload[parent][child] = payload[key];
    delete payload[key];
  }

  // Resolve ID lookup fields (Building → buildingID, etc.)
  // For isArray fields, split delimited values (semicolons/commas) and resolve each individually.
  const lookups = effectiveLookups;
  Object.entries(lookups).forEach(([fmxField, lookup]) => {
    const rawValue = row[fmxField];
    if (!rawValue) return;

    if (lookup.isArray) {
      // Split multi-value input and resolve each individually
      const parts = String(rawValue).split(/[;,]/).map(s => s.trim()).filter(Boolean);
      const resolvedIds = [];
      for (const part of parts) {
        const key = `${fmxField}:${part}`;
        if (idCache[key]) {
          resolvedIds.push(idCache[key]);
        } else {
          console.warn(`[FMX ID Resolve] No match for "${fmxField}": "${part}" → ${lookup.idField}`);
        }
      }
      if (resolvedIds.length > 0) {
        if (lookup.idField === 'resourceQuantities') {
          payload[lookup.idField] = resolvedIds.map(id => ({ resourceID: id, quantity: 1 }));
        } else {
          payload[lookup.idField] = resolvedIds;
        }
      }
    } else {
      // Single-value lookup
      const cacheKey = `${fmxField}:${rawValue}`;
      if (idCache[cacheKey]) {
        payload[lookup.idField] = idCache[cacheKey];
      } else {
        console.warn(`[FMX ID Resolve] No match for "${fmxField}": "${rawValue}" → ${lookup.idField} will be missing from payload`);
      }
    }
  });

  if (baseType === 'User' && !payload.password) {
    payload.password = generateDefaultPassword();
    payload.requirePasswordChange = true;
  }

  return payload;
}

// Fetch all records from an endpoint using paginated requests.
// Used by update-mode to resolve existing entity IDs by name/tag.
// `creds` is { projectId } (preferred) or { siteUrl, email, password } (verify flows).
export async function fetchAllRecords(creds, endpoint, fields) {
  const allItems = [];
  let offset = 0;
  const limit = 100;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const qs = `?fields=${encodeURIComponent(fields)}&offset=${offset}&limit=${limit}`;
    const res = await fmxFetch({
      ...creds,
      endpoint: `${endpoint}${qs}`,
      method: 'GET',
    });

    const headerTotal = res.headers.get('FMX-Total-Count');
    if (headerTotal) totalCount = parseInt(headerTotal, 10);

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
    if (!Array.isArray(items) || items.length === 0) break;

    allItems.push(...items);
    offset += limit;

    if (!headerTotal && items.length < limit) break;
  }

  return allItems;
}

// Resolves the {module} token in a lookup endpoint using the row's schemaType.
// No-op for endpoints without the token. If the token is present but the schemaType
// has no module slug (static type), logs a warning and returns the unresolved string
// so the bug surfaces as a 404 rather than silently hitting the wrong module.
function resolveLookupEndpoint(endpoint, schemaType) {
  if (!endpoint.includes('{module}')) return endpoint;
  const slug = getSchemaModuleSlug(schemaType);
  if (!slug) {
    console.warn(`[FMX lookup] {module} token in "${endpoint}" but schemaType "${schemaType}" has no module slug`);
    return endpoint;
  }
  return endpoint.replace('{module}', slug);
}

// Maps FMX API endpoints to dependency cache keys. Covers the static 1:1 deps;
// module-scoped deps (request-types, instruction-sets) are handled in
// resolveDepKey() below because they need the current schemaType's module slug.
const ENDPOINT_TO_DEP_KEY = {
  '/v1/buildings':        'buildings',
  '/v1/resources':        'resources',
  '/v1/users':            'users',
  '/v1/equipment-types':  'equipment-types',
  '/v1/equipment':        'equipment',
  '/v1/inventory-types':  'inventory-types',
  '/v1/inventory':        'inventory',
  '/v1/request-types':    'request-types',
  '/v1/resource-types':   'resource-types',
  '/v1/user-types':       'user-types',
};

// Picks the dep cache key to use when resolving a lookup.
// Returns an ordered list of candidate keys (preferred first). Callers should
// try each in turn and fall back to the next if the preferred cache is empty
// or missing — this keeps static behavior when dependencies haven't been
// re-synced against the new module-scoped schema yet.
//
// `resolvedEndpoint` is already post-{module}-substitution (see
// resolveLookupEndpoint). `schemaType` may be module-qualified
// (e.g. "Work Task:fit-inspections") or not.
function resolveDepKey(resolvedEndpoint, schemaType) {
  const slug = schemaType && schemaType.indexOf(':') !== -1
    ? schemaType.slice(schemaType.indexOf(':') + 1)
    : null;

  // Instruction-sets: path of the form /v1/{slug}/instruction-sets
  const instrMatch = resolvedEndpoint.match(/^\/v1\/([^/]+)\/instruction-sets$/);
  if (instrMatch) {
    const s = instrMatch[1];
    return [`work-task-instruction-sets:${s}`, 'work-task-instruction-sets'];
  }

  // Request types: module-scoped cache preferred, full list as fallback
  if (resolvedEndpoint === '/v1/request-types') {
    return slug ? [`request-types:${slug}`, 'request-types'] : ['request-types'];
  }

  const staticKey = ENDPOINT_TO_DEP_KEY[resolvedEndpoint];
  return staticKey ? [staticKey] : [];
}

// Build a name→ID lookup from dependency cache items.
function buildDepLookup(items, nameField = 'name') {
  const map = {};
  for (const item of items) {
    const key = nameField === 'name' ? item.name : item[nameField] || item.name;
    if (key) map[key] = item.id;
  }
  return map;
}

// Match an input value against a dep lookup using case-insensitive + trimmed matching.
function matchDepLookup(value, depLookup) {
  if (depLookup[value] !== undefined) return depLookup[value];
  const lower = String(value).toLowerCase().trim();
  for (const [key, id] of Object.entries(depLookup)) {
    if (String(key).toLowerCase().trim() === lower) return id;
  }
  return undefined;
}

// Pre-fetch IDs for all unique reference values in the dataset.
// Returns { idCache: { "Building:Main Campus": 42, ... }, unresolved: [...] }
// If dependencyCaches is provided (from getAllDependencyCaches), uses cached name→ID mappings.
// Unresolved values are batched by endpoint and fetched in parallel bulk requests
// rather than issuing individual sequential API calls per value.
export async function buildIdCache(rows, schemaType, creds, dependencyCaches = [], lookupFieldsOverride = null) {
  const lookups = lookupFieldsOverride || {};
  const idCache = {};
  const unresolved = [];

  // Index dependency caches by key for quick access
  const depByKey = {};
  for (const row of dependencyCaches) {
    if (row.extra?.items) {
      depByKey[row.schema_type] = row.extra.items;
    }
  }

  // Phase 1: Collect unique values per field and resolve from dep cache.
  // Track unresolved values grouped by endpoint for bulk fetching.
  // pendingByEndpoint: { endpoint: [{ cacheKey, value, nameField }] }
  const pendingByEndpoint = {};

  for (const [fmxField, lookup] of Object.entries(lookups)) {
    const seen = new Set();
    const uniqueValues = [];
    for (const row of rows) {
      const cellValue = row[fmxField];
      if (!cellValue) continue;
      const vals = lookup.isArray
        ? String(cellValue).split(/[;,]/).map(s => s.trim()).filter(Boolean)
        : [String(cellValue)];
      for (const v of vals) {
        if (!seen.has(v)) { seen.add(v); uniqueValues.push(v); }
      }
    }

    const endpoint = resolveLookupEndpoint(lookup.endpoint, schemaType);

    // Try each candidate dep key in order; prefer a non-empty module-scoped
    // bucket, fall back to the consolidated cache if the bucket is missing
    // (e.g. deps haven't been re-synced since module-scoping landed).
    const depKeyCandidates = resolveDepKey(endpoint, schemaType);
    let depKey = null;
    let depItems = null;
    for (const cand of depKeyCandidates) {
      const items = depByKey[cand];
      if (items && items.length > 0) {
        depKey = cand;
        depItems = items;
        break;
      }
    }
    const baseKey = depKey ? depKey.split(':')[0] : null;
    const nameField = baseKey === 'equipment' ? 'tag' : 'name';
    const depLookup = depItems ? buildDepLookup(depItems, nameField) : {};

    for (const value of uniqueValues) {
      const cacheKey = `${fmxField}:${value}`;
      const depId = matchDepLookup(value, depLookup);
      if (depId !== undefined) {
        idCache[cacheKey] = depId;
        continue;
      }
      // Queue for bulk fetch
      if (!pendingByEndpoint[endpoint]) pendingByEndpoint[endpoint] = { nameField, items: [] };
      pendingByEndpoint[endpoint].items.push({ cacheKey, value });
    }
  }

  // Phase 2: Bulk-fetch all records for each endpoint with unresolved values.
  // Uses fetchAllPages with minimal fields to get a complete name→ID map per endpoint,
  // then matches locally — replaces N sequential search calls with one paginated fetch.
  const endpointEntries = Object.entries(pendingByEndpoint);
  if (endpointEntries.length > 0) {
    const settled = await Promise.allSettled(
      endpointEntries.map(async ([endpoint, { nameField, items }]) => {
        // Fetch all records from this endpoint with minimal fields
        const fields = `id,name,tag,email`;
        try {
          const { items: allRecords } = await fetchAllPages(creds, endpoint, fields);
          const bulkLookup = buildDepLookup(allRecords, nameField);
          // Also build a secondary lookup by 'name' if nameField is 'tag' (or vice versa)
          // to catch matches on either field
          const altLookup = nameField !== 'name'
            ? buildDepLookup(allRecords, 'name')
            : buildDepLookup(allRecords, 'tag');

          for (const { cacheKey, value } of items) {
            const id = matchDepLookup(value, bulkLookup) ?? matchDepLookup(value, altLookup);
            if (id !== undefined) {
              idCache[cacheKey] = id;
            } else {
              unresolved.push(cacheKey);
            }
          }
        } catch (e) {
          console.warn(`[buildIdCache] bulk fetch failed for ${endpoint}, falling back to individual lookups:`, e);
          // Fallback: individual search calls (original behavior)
          for (const { cacheKey, value } of items) {
            try {
              const res = await fmxFetch({
                ...creds,
                endpoint: `${endpoint}?search=${encodeURIComponent(value)}&limit=1&fields=id,name,tag`,
                method: 'GET',
              });
              const data = await res.json();
              const records = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
              if (records.length > 0) {
                idCache[cacheKey] = records[0].id;
              } else {
                unresolved.push(cacheKey);
              }
            } catch (err) {
              console.warn(`Could not resolve ID for ${cacheKey}`, err);
              unresolved.push(cacheKey);
            }
          }
        }
      })
    );
    // Log any rejected promises (shouldn't happen since we catch inside, but safety net)
    for (const r of settled) {
      if (r.status === 'rejected') console.warn('[buildIdCache] unexpected rejection:', r.reason);
    }
  }

  return { idCache, unresolved };
}
