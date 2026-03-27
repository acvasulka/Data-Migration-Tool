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

// Fetch all records from an endpoint using paginated requests.
// Returns an array of all items across all pages.
export async function fetchAllRecords(siteUrl, email, password, endpoint, fields) {
  const allItems = [];
  let offset = 0;
  const limit = 100;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const qs = `?fields=${encodeURIComponent(fields)}&offset=${offset}&limit=${limit}`;
    const res = await fetch('/api/fmx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl, email, password,
        endpoint: `${endpoint}${qs}`,
        method: 'GET',
        payload: null,
      }),
    });

    // Read FMX-Total-Count header for accurate pagination
    const headerTotal = res.headers.get('FMX-Total-Count');
    if (headerTotal) totalCount = parseInt(headerTotal, 10);

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
    if (!Array.isArray(items) || items.length === 0) break;

    allItems.push(...items);
    offset += limit;

    // If no header, stop when a page returns fewer than limit
    if (!headerTotal && items.length < limit) break;
  }

  return allItems;
}

// Match an input value against a list of records using the nameField.
// Strategy: exact match → case-insensitive → trimmed case-insensitive.
function matchRecord(value, records, nameField) {
  const input = String(value);
  // Exact match
  const exact = records.find(r => String(r[nameField] ?? '') === input);
  if (exact) return exact.id;
  // Case-insensitive
  const lower = input.toLowerCase();
  const ci = records.find(r => String(r[nameField] ?? '').toLowerCase() === lower);
  if (ci) return ci.id;
  // Trimmed case-insensitive
  const trimmed = lower.trim();
  const tr = records.find(r => String(r[nameField] ?? '').toLowerCase().trim() === trimmed);
  if (tr) return tr.id;
  return null;
}

// Pre-fetch IDs for all reference values in the dataset using bulk fetch + local match.
// Returns { idCache: { "Building:Main Campus": 42, ... }, unresolved: ["Building:Unknown Place", ...] }
// Optional existingCache: pre-populated cache from previous pushes (e.g. from createdIdsRef)
// to skip API calls for values already resolved.
export async function buildIdCache(rows, schemaType, siteUrl, email, password, existingCache = {}) {
  const lookups = FMX_ID_LOOKUP_FIELDS[getBaseSchemaType(schemaType)] || {};
  const idCache = { ...existingCache };
  const unresolved = [];

  // Group lookups by endpoint to avoid fetching the same endpoint multiple times
  // (e.g. multiple fields may reference /v1/buildings)
  const endpointRecords = {};

  for (const [fmxField, lookup] of Object.entries(lookups)) {
    const uniqueValues = [...new Set(rows.map(r => r[fmxField]).filter(Boolean))];
    if (uniqueValues.length === 0) continue;

    const nameField = lookup.nameField || 'name';
    const fields = `id,${nameField}`;
    const epKey = `${lookup.endpoint}|${fields}`;

    // Fetch records for this endpoint (cached across fields sharing the same endpoint)
    if (!endpointRecords[epKey]) {
      try {
        endpointRecords[epKey] = await fetchAllRecords(siteUrl, email, password, lookup.endpoint, fields);
      } catch (e) {
        console.warn(`Could not fetch records from ${lookup.endpoint}:`, e);
        endpointRecords[epKey] = [];
      }
    }

    const records = endpointRecords[epKey];

    for (const value of uniqueValues) {
      const cacheKey = `${fmxField}:${value}`;
      // Skip if already resolved (from existingCache or prior endpoint in this run)
      if (idCache[cacheKey]) continue;
      const id = matchRecord(value, records, nameField);
      if (id !== null) {
        idCache[cacheKey] = id;
      } else {
        unresolved.push(cacheKey);
        console.warn(`Could not resolve ID for ${fmxField}: "${value}"`);
      }
    }
  }

  return { idCache, unresolved };
}
