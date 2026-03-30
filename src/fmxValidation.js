// Pre-push payload validation using post-options metadata.
// Validates transformed payloads against FMX system field and custom field constraints.

/**
 * Validate a single transformed payload against post-options metadata.
 * @param {Object} payload - The transformed FMX API payload
 * @param {Array} systemFields - System field metadata from post-options
 * @param {Array} customFields - Custom field metadata from post-options
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validatePayload(payload, systemFields = [], customFields = []) {
  const errors = [];
  const warnings = [];

  // Build lookup maps
  const sysByKey = new Map(systemFields.map(sf => [sf.key, sf]));
  const cfById = new Map(customFields.map(cf => [cf.id, cf]));

  // Check required system fields
  for (const sf of systemFields) {
    if (!sf.isRequired) continue;
    if (!sf.isPermitted) continue; // not relevant if field isn't permitted
    const val = payload[sf.key];
    if (val === undefined || val === null || val === '') {
      errors.push(`Required field "${sf.label || sf.key}" is missing`);
    }
  }

  // Validate system field values
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'customFields') continue;
    const sf = sysByKey.get(key);
    if (!sf) continue;

    // Check permission
    if (!sf.isPermitted) {
      warnings.push(`Field "${sf.label || key}" is not permitted and will be ignored by FMX`);
      continue;
    }

    // String length bounds
    if (typeof value === 'string') {
      if (sf.maximumLength && value.length > sf.maximumLength) {
        errors.push(`"${sf.label || key}" exceeds max length of ${sf.maximumLength} (got ${value.length})`);
      }
      if (sf.minimumLength && value.length < sf.minimumLength) {
        errors.push(`"${sf.label || key}" is shorter than min length of ${sf.minimumLength}`);
      }
    }

    // Numeric bounds
    if (typeof value === 'number') {
      if (sf.minimumValue !== null && sf.minimumValue !== undefined && value < sf.minimumValue) {
        errors.push(`"${sf.label || key}" is below minimum value of ${sf.minimumValue}`);
      }
      if (sf.maximumValue !== null && sf.maximumValue !== undefined && value > sf.maximumValue) {
        errors.push(`"${sf.label || key}" is above maximum value of ${sf.maximumValue}`);
      }
    }

    // System field options validation (enum-like fields)
    if (sf.options && Array.isArray(sf.options) && sf.options.length > 0) {
      const strVal = String(value);
      const validOptions = sf.options.map(o => typeof o === 'object' ? (o.value || o.label || '') : String(o));
      if (!validOptions.some(opt => opt === strVal || opt.toLowerCase() === strVal.toLowerCase())) {
        warnings.push(`"${sf.label || key}" value "${strVal}" not in allowed options`);
      }
    }
  }

  // Check required custom fields
  const payloadCFs = payload.customFields || [];
  const payloadCFIds = new Set(payloadCFs.map(cf => cf.customFieldID));

  for (const cf of customFields) {
    if (!cf.isRequired) continue;
    if (!payloadCFIds.has(cf.id)) {
      errors.push(`Required custom field "${cf.name}" is missing`);
    }
  }

  // Validate custom field dropdown values
  for (const pcf of payloadCFs) {
    const meta = cfById.get(pcf.customFieldID);
    if (!meta) continue;

    // Dropdown validation
    if (meta.options && meta.options.length > 0) {
      const values = pcf.values || (pcf.value !== undefined ? [pcf.value] : []);
      for (const v of values) {
        const strVal = String(v);
        const isValid = meta.options.some(opt =>
          String(opt) === strVal || String(opt).toLowerCase() === strVal.toLowerCase()
        );
        if (!isValid && !(meta.allowOtherOption && strVal)) {
          errors.push(`Custom field "${meta.name}" value "${strVal}" not in allowed options: ${meta.options.join(', ')}`);
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Apply default values from post-options to a payload for missing optional fields.
 * Mutates the payload in-place.
 */
export function applyDefaults(payload, systemFields = [], customFields = []) {
  // System field defaults
  for (const sf of systemFields) {
    if (!sf.isPermitted) continue;
    if (payload[sf.key] !== undefined && payload[sf.key] !== null && payload[sf.key] !== '') continue;
    if (sf.defaultValue !== null && sf.defaultValue !== undefined) {
      payload[sf.key] = sf.defaultValue;
    }
  }

  // Custom field defaults
  const payloadCFs = payload.customFields || [];
  const payloadCFIds = new Set(payloadCFs.map(cf => cf.customFieldID));

  for (const cf of customFields) {
    if (payloadCFIds.has(cf.id)) continue;
    if (cf.defaults && cf.defaults.length > 0) {
      if (!payload.customFields) payload.customFields = [];
      payload.customFields.push({
        customFieldID: cf.id,
        value: cf.defaults.length === 1 ? cf.defaults[0] : undefined,
        values: cf.defaults.length > 1 ? cf.defaults : undefined,
      });
    }
  }
}

/**
 * Validate all rows and return a summary.
 * @param {Array} payloads - Array of transformed payloads
 * @param {Array} systemFields - System field metadata
 * @param {Array} customFields - Custom field metadata
 * @returns {{ validCount: number, invalidCount: number, rowErrors: Array<{rowIndex: number, errors: string[], warnings: string[]}> }}
 */
export function validateAllPayloads(payloads, systemFields = [], customFields = []) {
  let validCount = 0;
  let invalidCount = 0;
  const rowErrors = [];

  for (let i = 0; i < payloads.length; i++) {
    const { errors, warnings } = validatePayload(payloads[i], systemFields, customFields);
    if (errors.length > 0) {
      invalidCount++;
      rowErrors.push({ rowIndex: i, errors, warnings });
    } else {
      validCount++;
      if (warnings.length > 0) {
        rowErrors.push({ rowIndex: i, errors: [], warnings });
      }
    }
  }

  return { validCount, invalidCount, rowErrors };
}
