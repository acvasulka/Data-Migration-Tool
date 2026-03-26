export const FMX_FIELD_TYPE_MAP = {
  'Text':        { label: 'Text',       category: 'string'  },
  'URL':         { label: 'URL',        category: 'string'  },
  'Date':        { label: 'Date',       category: 'date'    },
  'DropDownList':{ label: 'Dropdown',   category: 'string'  },
  'ReadOnly':    { label: 'Read only',  category: 'string'  },
  'Number':      { label: 'Number',     category: 'number'  },
  'Checkbox':    { label: 'Yes/No',     category: 'boolean' },
  'Time':        { label: 'Time',       category: 'string'  },
  'Attachments': { label: 'Attachment', category: 'string'  },
  'Currency':    { label: 'Currency',   category: 'number'  },
  'User':        { label: 'User',       category: 'string'  },
};

export function getFieldTypeLabel(fieldType) {
  return FMX_FIELD_TYPE_MAP[fieldType]?.label || fieldType || 'Text';
}

export function getFieldTypeCategory(fieldType) {
  return FMX_FIELD_TYPE_MAP[fieldType]?.category || 'string';
}

export function getTooltipText(field) {
  if (!field) return '';
  const baseType = field.isCustomField
    ? getFieldTypeLabel(field.fieldType)
    : {
        string: 'Text',
        number: 'Number',
        date: 'Date',
        email: 'Email',
      }[field.type] || 'Text';

  const format = {
    'Text':     'any characters',
    'URL':      'valid URL (e.g. https://example.com)',
    'Date':     'MM/DD/YYYY or YYYY-MM-DD',
    'Dropdown': 'one of the available options',
    'Number':   'numeric value (e.g. 1956 or 3.14)',
    'Yes/No':   'Yes or No',
    'Time':     'HH:MM (e.g. 09:30)',
    'Currency': 'numeric value (e.g. 25.00)',
    'Email':    'valid email (e.g. name@example.com)',
  }[baseType] || 'any value';

  const suffix = field.isCustomField ? ' · FMX Custom Field' : '';
  return `${baseType} — ${format}${suffix}`;
}
