import { FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS } from './fmxEndpoints';

// Transform a mapped row object into the correct FMX API payload shape.
// idCache: { "Building:Main Campus": 42 }
// customFieldIdMap: { "Year Built": 42, "Region": 7 } — maps friendly field name to FMX custom field ID
export function transformRowToPayload(row, schemaType, idCache = {}, customFieldIdMap = {}) {
  const fieldMap = FMX_FIELD_MAP[schemaType] || {};
  const payload = {};
  const customFields = [];

  Object.entries(row).forEach(([fieldName, value]) => {
    if (value === null || value === undefined || value === '') return;

    // Match by friendly name in customFieldIdMap (e.g. "Year Built" → ID 42)
    if (customFieldIdMap[fieldName] !== undefined) {
      customFields.push({ customFieldID: customFieldIdMap[fieldName], value: String(value) });
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

    // Standard field
    const apiKey = fieldMap[fieldName];
    if (apiKey) payload[apiKey] = value;
  });

  if (customFields.length > 0) {
    payload.customFields = customFields;
  }

  // Resolve ID lookup fields (Building → buildingID, etc.)
  const lookups = FMX_ID_LOOKUP_FIELDS[schemaType] || {};
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

// Pre-fetch IDs for all unique reference values in the dataset.
// Returns an idCache map: { "Building:Main Campus": 42, ... }
export async function buildIdCache(rows, schemaType, siteUrl, email, password) {
  const lookups = FMX_ID_LOOKUP_FIELDS[schemaType] || {};
  const idCache = {};

  for (const [fmxField, lookup] of Object.entries(lookups)) {
    const uniqueValues = [...new Set(rows.map(r => r[fmxField]).filter(Boolean))];
    for (const value of uniqueValues) {
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
