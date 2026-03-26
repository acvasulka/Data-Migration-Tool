export const FMX_FIELD_TYPE_MAP = {
  // Numeric enum values from FMX API
  0: { label: 'Text', type: 'string' },
  1: { label: 'Long Text', type: 'string' },
  2: { label: 'Number', type: 'number' },
  3: { label: 'Date', type: 'date' },
  4: { label: 'Dropdown', type: 'string' },
  5: { label: 'Multi-select', type: 'string' },
  6: { label: 'Yes/No', type: 'boolean' },
  7: { label: 'Currency', type: 'number' },
  8: { label: 'Attachment', type: 'string' },
  // String versions in case API returns string names
  'Text':        { label: 'Text', type: 'string' },
  'LongText':    { label: 'Long Text', type: 'string' },
  'Numeric':     { label: 'Number', type: 'number' },
  'Date':        { label: 'Date', type: 'date' },
  'Dropdown':    { label: 'Dropdown', type: 'string' },
  'MultiSelect': { label: 'Multi-select', type: 'string' },
  'Checkbox':    { label: 'Yes/No', type: 'boolean' },
  'Currency':    { label: 'Currency', type: 'number' },
};

export function getFieldTypeLabel(fieldType) {
  return FMX_FIELD_TYPE_MAP[fieldType]?.label || `Type ${fieldType}`;
}

export function getFieldTypeCategory(fieldType) {
  return FMX_FIELD_TYPE_MAP[fieldType]?.type || 'string';
}
