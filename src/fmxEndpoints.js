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

export function resolveGetOptionsEndpoint(schemaType, modules) {
  const base = resolveEndpoint(schemaType, modules);
  return base ? `${base}/get-options` : null;
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
    'Tag':                             'tag',
    // Location/Type/Parent/Inventory/Users are ID lookups — not direct string fields
    // Asset Condition is an integer enum — handled specially in fmxTransform.js
    'Downtime calculation start date': 'downtimeCalculationStartDate',
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
    'Is location':                'isLocation',
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
    'Latitude':                   'latitude',
    'Longitude':                  'longitude',
    'Scheduled Time Block':       'scheduledTimeBlock',
    'Signature':                  'signature',
  },
  'Schedule Request': {
    'Name':                       'name',
    'Other Resource':             'otherResource',
    'Is Private':                 'isPrivate',
    'Event Time':                 'event-time',
    'Reservation Time':           'reservation-time',
    'Setup Time':                 'setup-duration',
    'Teardown Time':              'teardown-duration',
    // firstOccurrenceEventTimeBlock fields (dot-notation → nested object in transform)
    'Event Start Date':           'firstOccurrenceEventTimeBlock.startDate',
    'Event End Date':             'firstOccurrenceEventTimeBlock.endDate',
    'Event Start Time':           'firstOccurrenceEventTimeBlock.startTimeUtc',
    'Event End Time':             'firstOccurrenceEventTimeBlock.endTimeUtc',
    // schedule/recurrence fields (dot-notation → nested object in transform)
    'Recurrence Frequency':       'schedule.frequency',
    'Recurrence Interval':        'schedule.interval',
    'Recurrence Days':            'schedule.weeklyDaysOfWeek',
    'Monthly Recurrence':         'schedule.monthlyRecurrence',
    'Recurrence End Date':        'schedule.endDate',
    'Recurrence End Count':       'schedule.endCount',
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
// nameField: which response property to match input values against (default: 'name').
const FMX_ID_LOOKUP_FIELDS = {
  'Equipment': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',               nameField: 'name' },
    'Type':              { endpoint: '/v1/equipment-types', idField: 'equipmentTypeID',          nameField: 'name' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',       nameField: 'name' },
    'Parent Equipment':  { endpoint: '/v1/equipment',       idField: 'parentEquipmentID',        nameField: 'tag' },
    'Inventory items':   { endpoint: '/v1/inventory',       idField: 'inventoryItemIDs',         nameField: 'name', isArray: true },
    'Assigned users':    { endpoint: '/v1/users',           idField: 'assignedUserIDs',          nameField: 'name', isArray: true },
  },
  'Inventory': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                nameField: 'name' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        nameField: 'name' },
    'Type':              { endpoint: '/v1/inventory-types', idField: 'inventoryTypeID',           nameField: 'name' },
  },
  'Resource': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                nameField: 'name' },
    'Resource type':     { endpoint: '/v1/resource-types',  idField: 'resourceTypeIDs',           nameField: 'name', isArray: true },
  },
  'User': {
    'Building access':   { endpoint: '/v1/buildings',       idField: 'accessibleBuildingIDs',     nameField: 'name', isArray: true },
    'User type':         { endpoint: '/v1/user-types',      idField: 'userTypeID',                nameField: 'name' },
    'Assigned Equipment':{ endpoint: '/v1/equipment',       idField: 'assignedEquipmentItemIDs',  nameField: 'tag',  isArray: true },
  },
  'Work Request': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                nameField: 'name' },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        nameField: 'name' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             nameField: 'name' },
    'Equipment Items':   { endpoint: '/v1/equipment',       idField: 'equipmentItemIDs',          nameField: 'tag',  isArray: true },
    'On Behalf Of':      { endpoint: '/v1/users',           idField: 'onBehalfOfUserID',          nameField: 'name' },
    'Assigned Users':    { endpoint: '/v1/users',           idField: 'assignedUserIDs',           nameField: 'name', isArray: true },
    'Parent Request':    { endpoint: '/v1/maintenance-requests', idField: 'parentRequestID',      nameField: 'name' },
    'Child Requests':    { endpoint: '/v1/maintenance-requests', idField: 'childRequestIDs',      nameField: 'name', isArray: true },
    'Blocked By':        { endpoint: '/v1/maintenance-requests', idField: 'blockedByRequestIDs',  nameField: 'name', isArray: true },
    'Blocking':          { endpoint: '/v1/maintenance-requests', idField: 'blockingRequestIDs',   nameField: 'name', isArray: true },
    'Following Users':   { endpoint: '/v1/users',           idField: 'followingUserIDs',          nameField: 'name', isArray: true },
  },
  'Schedule Request': {
    'Buildings':         { endpoint: '/v1/buildings',       idField: 'buildingIDs',               nameField: 'name', isArray: true },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             nameField: 'name' },
    'Resources':         { endpoint: '/v1/resources',       idField: 'resourceQuantities',        nameField: 'name', isArray: true },
  },
  'Work Task': {
    'Buildings':         { endpoint: '/v1/buildings',       idField: 'buildingIDs',               nameField: 'name', isArray: true },
    'Location':          { endpoint: '/v1/resources',       idField: 'locationResourceID',        nameField: 'name' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             nameField: 'name' },
    'Equipment Items':   { endpoint: '/v1/equipment',       idField: 'equipmentItemIDs',          nameField: 'tag',  isArray: true },
    'Assigned Users':    { endpoint: '/v1/users',           idField: 'assignedUserIDs',           nameField: 'name', isArray: true },
  },
  'Transportation Request': {
    'Building':          { endpoint: '/v1/buildings',       idField: 'buildingID',                nameField: 'name' },
    'Pickup Location':   { endpoint: '/v1/resources',       idField: 'pickupLocationResourceID',  nameField: 'name' },
    'Request Type':      { endpoint: '/v1/request-types',   idField: 'requestTypeID',             nameField: 'name' },
  },
};

// Assignment fields for Work Requests — these are separated from the main payload
// and posted to /v1/{module}-requests/{id}/assignments after creation.
const FMX_ASSIGNMENT_FIELDS = {
  'Work Request': {
    userField: 'Assigned Users',           // row field name containing user name(s)
    userEndpoint: '/v1/users',             // endpoint to resolve user IDs
    priorityField: 'Priority Level',       // row field name for priority
  },
};

export { FMX_ENDPOINTS, FMX_FIELD_MAP, FMX_ID_LOOKUP_FIELDS, FMX_ASSIGNMENT_FIELDS };
