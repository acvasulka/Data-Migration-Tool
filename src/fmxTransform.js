import { getLookupConfig } from './fmxLookupRegistry';
import { getFieldTypeCategory } from './fmxFieldTypes';
import { getBaseSchemaType } from './schemas';

// Equipment assetCondition is an integer enum in the FMX API — fallback if post-options doesn't provide options
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
// fieldList: dynamic field array from post-options (via buildFieldListFromPostOptions)
// idCache: { "Building:Main Campus": 42 } — pre-built from get-options + search fallback
// customFieldIdMap: { "Year Built": 42 } — maps friendly name to FMX custom field ID
// customFieldMetadata: [{ id: 42, name: "Year Built", fieldType: "Numeric" }]
export function transformRowToPayload(row, schemaType, idCache = {}, customFieldIdMap = {}, customFieldMetadata = [], fieldList = []) {
  const payload = {};
  const customFields = [];

  // When a dynamic field list is available, use it as the source of truth
  if (fieldList.length > 0) {
    for (const field of fieldList) {
      const value = row[field.name];
      if (value === null || value === undefined || value === '') continue;

      // Custom field
      if (field.isCustomField && field.customFieldId) {
        const coerced = coerceCustomFieldValue(value, field.fieldType);
        if (coerced !== null) {
          customFields.push({ customFieldID: field.customFieldId, value: coerced });
        }
        continue;
      }

      // Lookup field — resolve from idCache
      if (field.isLookupField && field.apiKey) {
        const cacheKey = `${field.name}:${value}`;
        const resolvedId = idCache[cacheKey];
        if (resolvedId !== undefined) {
          const lookupCfg = field.lookupConfig || getLookupConfig(field.apiKey);
          payload[field.apiKey] = lookupCfg?.isArray ? [resolvedId] : resolvedId;
        }
        continue;
      }

      // Special handling: Equipment assetCondition → integer enum
      if (field.apiKey === 'assetCondition') {
        if (field.options && field.options.length > 0) {
          // Use options array from post-options: index = enum value
          const idx = field.options.findIndex(o => o.toLowerCase() === String(value).toLowerCase().trim());
          payload['assetCondition'] = idx >= 0 ? idx : 0;
        } else {
          // Fallback to hardcoded map
          const normalized = String(value).toLowerCase().trim();
          const enumVal = ASSET_CONDITION_MAP[normalized];
          payload['assetCondition'] = enumVal !== undefined ? enumVal : 0;
        }
        continue;
      }

      // Standard field — direct mapping
      if (field.apiKey) {
        payload[field.apiKey] = value;
      }
    }

    // Also handle any row fields matched by legacy customField_ keys
    for (const [fieldName, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') continue;
      if (fieldName.startsWith('customField_')) {
        const id = parseInt(fieldName.replace('customField_', ''), 10);
        if (!isNaN(id)) {
          customFields.push({ customFieldID: id, value: String(value) });
        }
      }
    }
  } else {
    // No field list — handle row entries directly (custom field fallback only)
    for (const [fieldName, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') continue;

      if (customFieldIdMap[fieldName] !== undefined) {
        const cfId = customFieldIdMap[fieldName];
        const cfMeta = customFieldMetadata.find(cf => cf.id === cfId);
        const coerced = coerceCustomFieldValue(value, cfMeta?.fieldType);
        if (coerced !== null) {
          customFields.push({ customFieldID: cfId, value: coerced });
        }
        continue;
      }

      if (fieldName.startsWith('customField_')) {
        const id = parseInt(fieldName.replace('customField_', ''), 10);
        if (!isNaN(id)) {
          customFields.push({ customFieldID: id, value: String(value) });
        }
      }
    }
  }

  if (customFields.length > 0) {
    payload.customFields = customFields;
  }

  console.warn('Payload:', JSON.stringify(payload));
  return payload;
}

// Pre-fetch IDs for all unique reference values in the dataset.
// Uses prebuiltIdMap from get-options as the base; only searches for missing values.
// fieldList: dynamic field array from post-options
// prebuiltIdMap: { "Building:Main Campus": 1, ... } from get-options
export async function buildIdCache(rows, schemaType, siteUrl, email, password, fieldList = [], prebuiltIdMap = {}) {
  const idCache = { ...prebuiltIdMap };

  // Determine which fields need lookup
  const lookupFields = fieldList.filter(f => f.isLookupField);

  for (const field of lookupFields) {
    const lookupCfg = field.lookupConfig || getLookupConfig(field.apiKey);
    if (!lookupCfg) continue;

    const uniqueValues = [...new Set(rows.map(r => r[field.name]).filter(Boolean))];
    for (const value of uniqueValues) {
      const cacheKey = `${field.name}:${value}`;

      // Skip if already resolved from get-options
      if (idCache[cacheKey] !== undefined) continue;

      // Search fallback for values not in get-options
      try {
        const res = await fetch('/api/fmx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteUrl, email, password,
            endpoint: `${lookupCfg.endpoint}?search=${encodeURIComponent(value)}&limit=1`,
            method: 'GET',
            payload: null,
          }),
        });
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
        if (Array.isArray(items) && items.length > 0) {
          idCache[cacheKey] = items[0].id;
        }
      } catch (e) {
        console.warn(`Could not resolve ID for ${field.name}:${value}`, e);
      }
    }
  }

  return idCache;
}
