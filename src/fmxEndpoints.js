// FMX API endpoint map. Module-based schemas use a function that accepts the project's fmx_modules object.
const FMX_ENDPOINTS = {
  'Building':               '/v1/buildings',
  'Resource':               '/v1/resources',
  'User':                   '/v1/users',
  'Equipment Type':         '/v1/equipment-types',
  'Equipment':              '/v1/equipment',
  'Inventory':              '/v1/inventory',
  'Work Request':           (m) => `/v1/${m?.workRequest || 'maintenance'}-requests`,
  'Schedule Request':       (m) => `/v1/${m?.scheduling  || 'scheduling'}/requests`,
  'Work Task':              (m) => `/v1/${m?.workTask    || 'maintenance'}/tasks`,
  'Transportation Request': '/v1/transportation-requests',
  'Accounting Account':     '/v1/accounting-accounts',
};

// Resolves the endpoint for a schema type.
// Handles module-qualified types like "Work Request:maintenance" (slug embedded in key),
// legacy module-function entries, and static string endpoints.
export function resolveEndpoint(schemaType, modules) {
  // Module-qualified types — slug is embedded in the key after ":"
  if (schemaType.startsWith('Work Request:'))
    return `/v1/${schemaType.split(':')[1]}-requests`;
  if (schemaType.startsWith('Schedule Request:'))
    return `/v1/${schemaType.split(':')[1]}/requests`;
  if (schemaType.startsWith('Work Task:'))
    return `/v1/${schemaType.split(':')[1]}/tasks`;
  // Static / legacy function-based entries
  const ep = FMX_ENDPOINTS[schemaType];
  if (!ep) return null;
  return typeof ep === 'function' ? ep(modules) : ep;
}

export function resolvePostOptionsEndpoint(schemaType, modules) {
  const base = resolveEndpoint(schemaType, modules);
  return base ? `${base}/post-options` : null;
}

// DEPRECATED: Use deriveFieldMap() from fmxFieldMetadata.js for dynamic field mapping.
// Retained as fallback when systemFields from /post-options are unavailable.
const FMX_FIELD_MAP = {
  'Building': {
    'Name':                       'name',
    'Address':                    'address',
    'Latitude':                   'latitude',
    'Longitude':                  'longitude',
    'Phone':                      'phone',
    'Tax rate':                   'taxRate',
    'Sunday From':                'sundayOperatingHoursStartTime',
    'Sunday To':                  'sundayOperatingHoursEndTime',
    'Monday From':                'mondayOperatingHoursStartTime',
    'Monday To':                  'mondayOperatingHoursEndTime',
    'Tuesday From':               'tuesdayOperatingHoursStartTime',
    'Tuesday To':                 'tuesdayOperatingHoursEndTime',
    'Wednesday From':             'wednesdayOperatingHoursStartTime',
    'Wednesday To':               'wednesdayOperatingHoursEndTime',
    'Thursday From':              'thursdayOperatingHoursStartTime',
    'Thursday To':                'thursdayOperatingHoursEndTime',
    'Friday From':                'fridayOperatingHoursStartTime',
    'Friday To':                  'fridayOperatingHoursEndTime',
    'Saturday From':              'saturdayOperatingHoursStartTime',
    'Saturday To':                'saturdayOperatingHoursEndTime',
  },
  'Equipment Type': {
    'Name':                       'name',
    'Track meters':               'trackMeters',
    'Track downtime':             'trackDowntime',
    'Track asset lifespan':       'trackAssetLifespan',
  },
  'Equipment': {
    'Tag':                        'tag',
    // Location is now an ID lookup (locationResourceID) — not a direct string field
    'Downtime calculation start date': 'downtimeCalculationStartDate',
    'Barcode ID':                 'barcodeID',
    'Cooling Capacity':           'coolingCapacity',
    'Date of Manufacture':        'dateOfManufacture',
    'Expected Replacement Cost':  'expectedReplacementCost',
    'Expected Replacement Date':  'expectedReplacementDate',
    'Filter size':                'filterSize',
    'Heating Capacity':           'heatingCapacity',
    'Installed Cost':             'installedCost',
    'Installed Date':             'installedDate',
    'Manufacturer':               'manufacturer',
    'Model number':               'modelNumber',
    'Serial number':              'serialNumber',
    // Asset Condition is an integer enum — handled specially in fmxTransform.js
    'Budget Category':            'budgetCategory',
    'Estimated end-of-life (EOL)': 'estimatedEndOfLife',
    'Planned replacement date':   'plannedReplacementDate',
    'Replacement asset value':    'replacementAssetValue',
  },
  'Inventory': {
    'Name':                       'name',
    // Location is now an ID lookup (locationResourceID) — not a direct string field
    'SKU':                        'sku',
    'Current quantity':           'currentQuantity',
    'Minimum quantity':           'minimumQuantity',
    'Unit price':                 'unitPrice',
    'Barcode Number':             'barcodeNumber',
  },
  'Resource': {
    'Name':                       'name',
    'Address':                    'address',
    'Latitude':                   'latitude',
    'Longitude':                  'longitude',
    // Resource type is now an array ID lookup — not a direct string field
    'Capacity':                   'capacity',
    'Quantity':                   'scheduleRequestQuantity',
    'Sunday From':                'sundayAvailabilityStartTime',
    'Sunday To':                  'sundayAvailabilityEndTime',
    'Monday From':                'mondayAvailabilityStartTime',
    'Monday To':                  'mondayAvailabilityEndTime',
    'Tuesday From':               'tuesdayAvailabilityStartTime',
    'Tuesday To':                 'tuesdayAvailabilityEndTime',
    'Wednesday From':             'wednesdayAvailabilityStartTime',
    'Wednesday To':               'wednesdayAvailabilityEndTime',
    'Thursday From':              'thursdayAvailabilityStartTime',
    'Thursday To':                'thursdayAvailabilityEndTime',
    'Friday From':                'fridayAvailabilityStartTime',
    'Friday To':                  'fridayAvailabilityEndTime',
    'Saturday From':              'saturdayAvailabilityStartTime',
    'Saturday To':                'saturdayAvailabilityEndTime',
  },
  'User': {
    'Name':                       'name',
    'Email':                      'email',
    'Phone':                      'phone',
    'Labor rate':                 'laborRate',
    'Is contact':                 'isContact',
    'Is supplier':                'isSupplier',
    'Can be a driver':            'canBeDriver',
    'Password':                   'password',
    'Require password change':    'requirePasswordChange',
    // User type is now an ID lookup (userTypeID)
    // Building access is now an ID lookup (accessibleBuildingIDs)
    // Assigned Equipment is now an ID lookup (assignedEquipmentItemIDs)
  },
  'Work Request': {
    'Name':                       'name',
    'Other Location':             'otherLocation',
    'Due Date':                   'dueDate',
  },
  'Schedule Request': {
    'Name':                       'name',
    'Other Resource':             'otherResource',
    'Is Private':                 'isPrivate',
  },
  'Work Task': {
    'Name':                       'name',
    'Mode':                       'mode',
    'Next Due Date':              'nextDueDate',
    'Other Location':             'otherLocation',
  },
  'Transportation Request': {
    'Name':                       'name',
    'Pickup Location Text':       'pickupLocation',
    'Destination':                'destination',
    'Departure Time':             'departureTimeUtc',
    'Return Time':                'returnTimeUtc',
  },
  'Accounting Account': {
    'Name':                       'name',
  },
};

// DEPRECATED: Use deriveLookupFields() from fmxFieldMetadata.js for dynamic lookup mapping.
// Retained as fallback when systemFields from /post-options are unavailable.
const FMX_ID_LOOKUP_FIELDS = {
  'Equipment': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                searchParam: 'search' },
    'Type':              { endpoint: '/v1/equipment-types', idField: 'equipmentTypeID',           searchParam: 'search' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        searchParam: 'search' },
    'Parent Equipment':  { endpoint: '/v1/equipment',       idField: 'parentEquipmentID',         searchParam: 'search' },
  },
  'Inventory': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                searchParam: 'search' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        searchParam: 'search' },
    'Type':              { endpoint: '/v1/inventory-types', idField: 'inventoryTypeID',           searchParam: 'search' },
  },
  'Resource': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                searchParam: 'search' },
    'Resource type':     { endpoint: '/v1/resource-types',  idField: 'resourceTypeIDs',           searchParam: 'search', isArray: true },
  },
  'User': {
    'Building access':   { endpoint: '/v1/buildings',       idField: 'accessibleBuildingIDs',     searchParam: 'search', isArray: true },
    'User type':         { endpoint: '/v1/user-types',      idField: 'userTypeID',                searchParam: 'search' },
    'Assigned Equipment':{ endpoint: '/v1/equipment',       idField: 'assignedEquipmentItemIDs',  searchParam: 'search', isArray: true },
  },
  'Work Request': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                searchParam: 'search' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        searchParam: 'search' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             searchParam: 'search' },
    'Equipment Items':   { endpoint: '/v1/equipment',       idField: 'equipmentItemIDs',          searchParam: 'search', isArray: true },
    'On Behalf Of':      { endpoint: '/v1/users',           idField: 'onBehalfOfUserID',          searchParam: 'search' },
  },
  'Schedule Request': {
    'Buildings':         { endpoint: '/v1/buildings',       idField: 'buildingIDs',               searchParam: 'search', isArray: true },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             searchParam: 'search' },
  },
  'Work Task': {
    'Buildings':         { endpoint: '/v1/buildings',       idField: 'buildingIDs',               searchParam: 'search', isArray: true },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        searchParam: 'search' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             searchParam: 'search' },
    'Equipment Items':   { endpoint: '/v1/equipment',       idField: 'equipmentItemIDs',          searchParam: 'search', isArray: true },
    'Assigned Users':    { endpoint: '/v1/users',           idField: 'assignedUserIDs',           searchParam: 'search', isArray: true },
  },
  'Transportation Request': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                searchParam: 'search' },
    'Pickup Location':   { endpoint: '/v1/resources',       idField: 'pickupLocationResourceID',  searchParam: 'search' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             searchParam: 'search' },
  },
};

export { FMX_ENDPOINTS, FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS };
