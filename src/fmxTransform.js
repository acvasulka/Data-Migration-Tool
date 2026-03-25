import { FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS } from './fmxEndpoints';

// Transform a mapped row object into the correct FMX API payload shape.
// idCache is a pre-built map of { "Building:Main Campus": 42 } etc.
export function transformRowToPayload(row, schemaType, idCache = {}) {
  const fieldMap = FMX_FIELD_MAP[schemaType] || {};
  const payload = {};

  Object.entries(row).forEach(([fmxField, value]) => {
    if (!value) return;
    const apiKey = fieldMap[fmxField];
    if (apiKey) payload[apiKey] = value;
  });

  // Resolve ID lookup fields
  const lookups = FMX_ID_LOOKUP_FIELDS[schemaType] || {};
  Object.entries(lookups).forEach(([fmxField, lookup]) => {
    const value = row[fmxField];
    if (!value) return;
    const cacheKey = `${fmxField}:${value}`;
    const resolvedId = idCache[cacheKey];
    if (resolvedId) {
      payload[lookup.idField] = lookup.isArray ? [resolvedId] : resolvedId;
    }
  });

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
