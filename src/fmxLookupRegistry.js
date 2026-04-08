// Static registry mapping FMX API field keys to their lookup endpoints and get-options response keys.
// Keyed by the systemField.key value returned from post-options.
// This is the single source of truth for how reference fields are resolved to IDs.

const ID_LOOKUP_REGISTRY = {
  buildingID:               { endpoint: '/v1/buildings',       getOptionsKey: 'buildings' },
  buildingIDs:              { endpoint: '/v1/buildings',       getOptionsKey: 'buildings',       isArray: true },
  equipmentTypeID:          { endpoint: '/v1/equipment-types', getOptionsKey: null },
  locationResourceID:       { endpoint: '/v1/resources',       getOptionsKey: 'resources' },
  parentEquipmentID:        { endpoint: '/v1/equipment',       getOptionsKey: 'equipment' },
  inventoryTypeID:          { endpoint: '/v1/inventory-types', getOptionsKey: null },
  resourceTypeIDs:          { endpoint: '/v1/resource-types',  getOptionsKey: null,              isArray: true },
  accessibleBuildingIDs:    { endpoint: '/v1/buildings',       getOptionsKey: 'buildings',       isArray: true },
  userTypeID:               { endpoint: '/v1/user-types',      getOptionsKey: null },
  assignedEquipmentItemIDs: { endpoint: '/v1/equipment',       getOptionsKey: 'equipment',       isArray: true },
  requestTypeID:            { endpoint: '/v1/request-types',   getOptionsKey: 'requestTypes' },
  equipmentItemIDs:         { endpoint: '/v1/equipment',       getOptionsKey: 'equipment',       isArray: true },
  onBehalfOfUserID:         { endpoint: '/v1/users',           getOptionsKey: 'assignmentUsers' },
  pickupLocationResourceID: { endpoint: '/v1/resources',       getOptionsKey: 'resources' },
  assignedUserIDs:          { endpoint: '/v1/users',           getOptionsKey: 'assignmentUsers', isArray: true },
};

/** Returns the lookup config for an API field key, or null if not a lookup field. */
export function getLookupConfig(apiKey) {
  return ID_LOOKUP_REGISTRY[apiKey] || null;
}

/** Returns true if the API field key requires ID resolution. */
export function isLookupField(apiKey) {
  return apiKey in ID_LOOKUP_REGISTRY;
}

// Cross-sheet validation map: apiKey → schema type name for cross-import-sheet checks.
// Only fields where the value must exist in another import sheet are listed here.
export const CROSS_SHEET_MAP = {
  buildingID:            'Building',
  buildingIDs:           'Building',
  accessibleBuildingIDs: 'Building',
  equipmentTypeID:       'Equipment Type',
};

/** Infer a display group name from the API field key. */
export function inferFieldGroup(apiKey) {
  if (/(?:OperatingHours|Availability)(?:Start|End)Time/i.test(apiKey)) return 'Operating Hours';
  return 'Core Fields';
}

/** Infer a field type category from the API field key. */
export function inferFieldType(apiKey) {
  if (/date|Date|Utc$/i.test(apiKey)) return 'date';
  if (/^email$/i.test(apiKey)) return 'email';
  if (/latitude|longitude|rate|cost|price|capacity|quantity|value|taxRate/i.test(apiKey)) return 'number';
  if (/^is[A-Z]|^can[A-Z]|^track[A-Z]|^disable|^require/i.test(apiKey)) return 'boolean';
  return 'string';
}
