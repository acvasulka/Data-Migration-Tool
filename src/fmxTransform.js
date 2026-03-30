import { FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS } from './fmxEndpoints';
import { getFieldTypeCategory } from './fmxFieldTypes';
import { getBaseSchemaType } from './schemas';
import { fmxFetch } from './apiClient';

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
    case 'date':
    case 'string':
    default:
      return String(value);
  }
}

// Transform a mapped row object into the correct FMX API payload shape.
// idCache: { "Building:Main Campus": 42 }
// customFieldIdMap: { "Year Built": 42, "Region": 7 } — maps friendly field name to FMX custom field ID
// customFieldMetadata: [{ id: 42, name: "Year Built", fieldType: "Numeric" }]
export function transformRowToPayload(row, schemaType, idCache = {}, customFieldIdMap = {}, customFieldMetadata = [], fieldMapOverride = null, lookupFieldsOverride = null) {
  const baseType = getBaseSchemaType(schemaType);
  const fieldMap = fieldMapOverride || FMX_FIELD_MAP[baseType] || {};
  const payload = {};
  const customFields = [];
  const droppedFields = [];

  // Build a set of lookup field names so we don't report them as "dropped"
  const lookupFieldNames = new Set(
    Object.keys(lookupFieldsOverride || FMX_ID_LOOKUP_FIELDS[baseType] || {})
  );

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
        customFields.push({ customFieldID: id, value: String(value) });
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
      payload[apiKey] = value;
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

  // Resolve ID lookup fields (Building → buildingID, etc.)
  const lookups = lookupFieldsOverride || FMX_ID_LOOKUP_FIELDS[baseType] || {};
  Object.entries(lookups).forEach(([fmxField, lookup]) => {
    const value = row[fmxField];
    if (!value) return;
    const cacheKey = `${fmxField}:${value}`;
    if (idCache[cacheKey]) {
      payload[lookup.idField] = lookup.isArray ? [idCache[cacheKey]] : idCache[cacheKey];
    } else {
      console.warn(`[FMX ID Resolve] No match for "${fmxField}": "${value}" → ${lookup.idField} will be missing from payload`);
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
export async function fetchAllRecords(siteUrl, email, password, endpoint, fields) {
  const allItems = [];
  let offset = 0;
  const limit = 100;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const qs = `?fields=${encodeURIComponent(fields)}&offset=${offset}&limit=${limit}`;
    const res = await fmxFetch({
      siteUrl, email, password,
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

// Maps FMX API endpoints to dependency cache keys
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
// If dependencyCaches is provided (from getAllDependencyCaches), uses cached name→ID mappings
// and only falls back to individual API calls for cache misses.
export async function buildIdCache(rows, schemaType, siteUrl, email, password, dependencyCaches = [], lookupFieldsOverride = null) {
  const lookups = lookupFieldsOverride || FMX_ID_LOOKUP_FIELDS[getBaseSchemaType(schemaType)] || {};
  const idCache = {};
  const unresolved = [];

  // Index dependency caches by key for quick access
  const depByKey = {};
  for (const row of dependencyCaches) {
    if (row.extra?.items) {
      depByKey[row.schema_type] = row.extra.items;
    }
  }

  for (const [fmxField, lookup] of Object.entries(lookups)) {
    const uniqueValues = [...new Set(rows.map(r => r[fmxField]).filter(Boolean))];

    // Try to resolve from dependency cache first
    const depKey = ENDPOINT_TO_DEP_KEY[lookup.endpoint];
    const depItems = depKey ? depByKey[depKey] : null;
    const depLookup = depItems ? buildDepLookup(depItems, depKey === 'equipment' ? 'tag' : 'name') : {};

    for (const value of uniqueValues) {
      const cacheKey = `${fmxField}:${value}`;

      // Check dependency cache (with case-insensitive matching)
      const depId = matchDepLookup(value, depLookup);
      if (depId !== undefined) {
        idCache[cacheKey] = depId;
        continue;
      }

      // Fall back to individual API search
      try {
        const searchParam = lookup.searchParam || 'search';
        const res = await fmxFetch({
          siteUrl, email, password,
          endpoint: `${lookup.endpoint}?${searchParam}=${encodeURIComponent(value)}&limit=1`,
          method: 'GET',
        });
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
        if (Array.isArray(items) && items.length > 0) {
          idCache[cacheKey] = items[0].id;
        } else {
          unresolved.push(cacheKey);
        }
      } catch (e) {
        console.warn(`Could not resolve ID for ${fmxField}:${value}`, e);
        unresolved.push(cacheKey);
      }
    }
  }

  return { idCache, unresolved };
}
