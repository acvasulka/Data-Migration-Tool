import { FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS } from './fmxEndpoints';
import { getFieldTypeCategory } from './fmxFieldTypes';
import { getBaseSchemaType } from './schemas';

// Equipment assetCondition is an integer enum in the FMX API
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
export function transformRowToPayload(row, schemaType, idCache = {}, customFieldIdMap = {}, customFieldMetadata = []) {
  const baseType = getBaseSchemaType(schemaType);
  const fieldMap = FMX_FIELD_MAP[baseType] || {};
  const payload = {};
  const customFields = [];

  Object.entries(row).forEach(([fieldName, value]) => {
    if (value === null || value === undefined || value === '') return;

    // Match by friendly name in customFieldIdMap (e.g. "Year Built" → ID 42)
    if (customFieldIdMap[fieldName] !== undefined) {
      const cfId = customFieldIdMap[fieldName];
      const cfMeta = customFieldMetadata.find(cf => cf.id === cfId);
      const coerced = coerceCustomFieldValue(value, cfMeta?.fieldType);
      if (coerced !== null) {
        customFields.push({ customFieldID: cfId, value: coerced });
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
    if (apiKey) payload[apiKey] = value;
  });

  if (customFields.length > 0) {
    payload.customFields = customFields;
  }

  // Resolve ID lookup fields (Building → buildingID, etc.)
  const lookups = FMX_ID_LOOKUP_FIELDS[baseType] || {};
  Object.entries(lookups).forEach(([fmxField, lookup]) => {
    const value = row[fmxField];
    if (!value) return;
    const cacheKey = `${fmxField}:${value}`;
    if (idCache[cacheKey]) {
      payload[lookup.idField] = lookup.isArray ? [idCache[cacheKey]] : idCache[cacheKey];
    }
  });

  console.warn('Payload:', JSON.stringify(payload));
  return payload;
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
  '/v1/resource-types':   'resources',   // resource-types map to resources cache as fallback
  '/v1/user-types':       'users',       // user-types not cached separately
};

// Build a name→ID lookup from dependency cache items.
// nameField defaults to 'name'; for equipment it's 'tag'.
function buildDepLookup(items, nameField = 'name') {
  const map = {};
  for (const item of items) {
    const key = nameField === 'name' ? item.name : item[nameField] || item.name;
    if (key) map[key] = item.id;
  }
  return map;
}

// Pre-fetch IDs for all unique reference values in the dataset.
// Returns an idCache map: { "Building:Main Campus": 42, ... }
// If dependencyCaches is provided (from getAllDependencyCaches), uses cached name→ID mappings
// and only falls back to individual API calls for cache misses.
export async function buildIdCache(rows, schemaType, siteUrl, email, password, dependencyCaches = []) {
  const lookups = FMX_ID_LOOKUP_FIELDS[getBaseSchemaType(schemaType)] || {};
  const idCache = {};

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
      // Check dependency cache
      if (depLookup[value] !== undefined) {
        idCache[`${fmxField}:${value}`] = depLookup[value];
        continue;
      }

      // Fall back to individual API search
      try {
        const res = await fetch('/api/fmx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteUrl, email, password,
            endpoint: `${lookup.endpoint}?${lookup.searchParam}=${encodeURIComponent(value)}&limit=1`,
            method: 'GET',
            payload: null,
          }),
        });
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
        if (Array.isArray(items) && items.length > 0) {
          idCache[`${fmxField}:${value}`] = items[0].id;
        }
      } catch (e) {
        console.warn(`Could not resolve ID for ${fmxField}:${value}`, e);
      }
    }
  }
  return idCache;
}
