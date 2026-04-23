// Registry for per-field prompts in the Equipment Label Property Upload tool.
//
// Each entry pairs a stable `key` (stored on prompts.field_key) with the
// human label the admin sees in the prompt editor. The matcher maps a live
// FMX field row (from post/get-options) onto one of these keys by label so
// admins don't have to re-author prompts for every FMX site's equivalent
// custom field — "Serial #", "Serial No.", "serial number" all map to the
// same `serial_number` key.
//
// Keys are slugs (lower_snake_case). Order controls the default presentation
// in the admin editor's field dropdown.

export const OCR_FIELD_PROMPTS = [
  { key: 'assigned_to',         label: 'Assigned to',                         match: /^assigned\s*to$/i },
  { key: 'barcode_id',          label: 'Barcode ID',                          match: /barcode/i },
  { key: 'building',            label: 'Building',                            match: /^building$/i },
  { key: 'cooling_capacity',    label: 'Cooling Capacity',                    match: /cooling/i },
  { key: 'date_of_manufacture', label: 'Date of Manufacture',                 match: /(date\s*of\s*manufacture|manufacture\s*date|mfg\.?\s*date)/i },
  { key: 'downtime_start',      label: 'Downtime calculation start date',     match: /downtime/i },
  { key: 'replacement_cost',    label: 'Expected Replacement Cost',           match: /(replacement\s*cost|expected\s*replacement\s*cost)/i },
  { key: 'replacement_date',    label: 'Expected Replacement Date',           match: /(replacement\s*date|expected\s*replacement\s*date)/i },
  { key: 'filter_size',         label: 'Filter size',                         match: /filter/i },
  { key: 'heating_capacity',    label: 'Heating Capacity',                    match: /heating/i },
  { key: 'installed_cost',      label: 'Installed Cost',                      match: /installed\s*cost/i },
  { key: 'installed_date',      label: 'Installed Date',                      match: /installed\s*date/i },
  { key: 'inventory_items',     label: 'Inventory items',                     match: /inventory\s*items?/i },
  { key: 'location',            label: 'Location',                            match: /^location$/i },
  { key: 'meter_types',         label: 'Meter types',                         match: /meter\s*types?/i },
  { key: 'meters',              label: 'Meters',                              match: /^meters?$/i },
  { key: 'model_number',        label: 'Model number',                        match: /model/i },
  { key: 'primary_equipment',   label: 'Primary equipment',                   match: /primary\s*equipment/i },
  { key: 'serial_number',       label: 'Serial number',                       match: /serial/i },
  { key: 'tag',                 label: 'Tag',                                 match: /^tag$/i },
  { key: 'type',                label: 'Type',                                match: /^(equipment\s*)?type$/i },
];

// Given a live field label (or key) from FMX, return the matching prompt
// key, or null if none of the registered patterns match. Matching against
// the user-visible label is intentional — FMX custom-field IDs are numeric
// and vary per site, so the label is the only portable identifier.
export function resolvePromptKeyForField(field) {
  if (!field) return null;
  const candidates = [field.label, field.name, field.key, String(field.key ?? '')].filter(Boolean);
  for (const c of candidates) {
    for (const entry of OCR_FIELD_PROMPTS) {
      if (entry.match.test(c)) return entry.key;
    }
  }
  return null;
}

export function getOcrFieldPromptMeta(key) {
  return OCR_FIELD_PROMPTS.find(e => e.key === key) || null;
}
