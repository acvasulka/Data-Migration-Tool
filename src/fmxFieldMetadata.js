// Dynamic field-definition builder.
// Merges live systemFields from the FMX /post-options API with a thin static
// enrichment layer that carries only what the API doesn't provide: field types,
// UI groups, crossSheet relationships, lookup endpoints, and special handling.
//
// This replaces the fully-hardcoded FMX_API_STANDARD_FIELDS in fmxFieldSchema.js
// and the FMX_FIELD_MAP / FMX_ID_LOOKUP_FIELDS in fmxEndpoints.js.

// --- Enrichment registry ---
// Keyed by [schemaType][systemField.key]. Each entry stores ONLY what the API
// doesn't tell us. Unlisted fields default to { type: 'string' }.
//
// Shape:
//   type?:       'number' | 'date' | 'email'  (default 'string')
//   group?:      string                         (default 'Core Fields')
//   crossSheet?: string                         (schema type for dep validation)
//   label?:      string                         (override API label)
//   lookup?:     { endpoint, searchParam, isArray? }  (for ID-resolution fields)
//   special?:    string                         (e.g. 'assetConditionEnum')

const FMX_FIELD_ENRICHMENTS = {
  'Building': {
    name:                                  { label: 'Name' },
    address:                               { label: 'Address' },
    latitude:                              { label: 'Latitude', type: 'number' },
    longitude:                             { label: 'Longitude', type: 'number' },
    phone:                                 { label: 'Phone' },
    taxRate:                               { label: 'Tax rate', type: 'number' },
    sundayOperatingHoursStartTime:         { label: 'Sunday From', group: 'Operating Hours' },
    sundayOperatingHoursEndTime:           { label: 'Sunday To', group: 'Operating Hours' },
    mondayOperatingHoursStartTime:         { label: 'Monday From', group: 'Operating Hours' },
    mondayOperatingHoursEndTime:           { label: 'Monday To', group: 'Operating Hours' },
    tuesdayOperatingHoursStartTime:        { label: 'Tuesday From', group: 'Operating Hours' },
    tuesdayOperatingHoursEndTime:          { label: 'Tuesday To', group: 'Operating Hours' },
    wednesdayOperatingHoursStartTime:      { label: 'Wednesday From', group: 'Operating Hours' },
    wednesdayOperatingHoursEndTime:        { label: 'Wednesday To', group: 'Operating Hours' },
    thursdayOperatingHoursStartTime:       { label: 'Thursday From', group: 'Operating Hours' },
    thursdayOperatingHoursEndTime:         { label: 'Thursday To', group: 'Operating Hours' },
    fridayOperatingHoursStartTime:         { label: 'Friday From', group: 'Operating Hours' },
    fridayOperatingHoursEndTime:           { label: 'Friday To', group: 'Operating Hours' },
    saturdayOperatingHoursStartTime:       { label: 'Saturday From', group: 'Operating Hours' },
    saturdayOperatingHoursEndTime:         { label: 'Saturday To', group: 'Operating Hours' },
  },

  'Equipment Type': {
    name:              { label: 'Name' },
    trackMeters:       { label: 'Track meters' },
    trackDowntime:     { label: 'Track downtime' },
    trackAssetLifespan:{ label: 'Track asset lifespan' },
  },

  'Equipment': {
    tag:                          { label: 'Tag' },
    equipmentTypeID:              { label: 'Type', crossSheet: 'Equipment Type', lookup: { endpoint: '/v1/equipment-types', searchParam: 'search' } },
    buildingID:                   { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    locationResourceID:           { label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    parentEquipmentID:            { label: 'Parent Equipment', lookup: { endpoint: '/v1/equipment', searchParam: 'search' } },
    downtimeCalculationStartDate: { label: 'Downtime calculation start date', type: 'date' },
    assetCondition:               { label: 'Asset Condition', special: 'assetConditionEnum' },
    barcodeID:                    { label: 'Barcode ID' },
    coolingCapacity:              { label: 'Cooling Capacity', type: 'number' },
    dateOfManufacture:            { label: 'Date of Manufacture', type: 'date' },
    expectedReplacementCost:      { label: 'Expected Replacement Cost', type: 'number' },
    expectedReplacementDate:      { label: 'Expected Replacement Date', type: 'date' },
    filterSize:                   { label: 'Filter size' },
    heatingCapacity:              { label: 'Heating Capacity', type: 'number' },
    installedCost:                { label: 'Installed Cost', type: 'number' },
    installedDate:                { label: 'Installed Date', type: 'date' },
    manufacturer:                 { label: 'Manufacturer' },
    modelNumber:                  { label: 'Model number' },
    serialNumber:                 { label: 'Serial number' },
    budgetCategory:               { label: 'Budget Category' },
    estimatedEndOfLife:           { label: 'Estimated end-of-life (EOL)', type: 'date' },
    plannedReplacementDate:       { label: 'Planned replacement date', type: 'date' },
    replacementAssetValue:        { label: 'Replacement asset value', type: 'number' },
  },

  'Inventory': {
    name:              { label: 'Name' },
    inventoryTypeID:   { label: 'Type', lookup: { endpoint: '/v1/inventory-types', searchParam: 'search' } },
    buildingID:        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    currentQuantity:   { label: 'Current quantity', type: 'number' },
    sku:               { label: 'SKU' },
    minimumQuantity:   { label: 'Minimum quantity', type: 'number' },
    unitPrice:         { label: 'Unit price', type: 'number' },
    barcodeNumber:     { label: 'Barcode Number' },
  },

  'Resource': {
    name:                              { label: 'Name' },
    buildingID:                        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    address:                           { label: 'Address' },
    latitude:                          { label: 'Latitude', type: 'number' },
    longitude:                         { label: 'Longitude', type: 'number' },
    resourceTypeIDs:                   { label: 'Resource type', lookup: { endpoint: '/v1/resource-types', searchParam: 'search', isArray: true } },
    capacity:                          { label: 'Capacity', type: 'number' },
    scheduleRequestQuantity:           { label: 'Quantity', type: 'number' },
    sundayAvailabilityStartTime:       { label: 'Sunday From', group: 'Operating Hours' },
    sundayAvailabilityEndTime:         { label: 'Sunday To', group: 'Operating Hours' },
    mondayAvailabilityStartTime:       { label: 'Monday From', group: 'Operating Hours' },
    mondayAvailabilityEndTime:         { label: 'Monday To', group: 'Operating Hours' },
    tuesdayAvailabilityStartTime:      { label: 'Tuesday From', group: 'Operating Hours' },
    tuesdayAvailabilityEndTime:        { label: 'Tuesday To', group: 'Operating Hours' },
    wednesdayAvailabilityStartTime:    { label: 'Wednesday From', group: 'Operating Hours' },
    wednesdayAvailabilityEndTime:      { label: 'Wednesday To', group: 'Operating Hours' },
    thursdayAvailabilityStartTime:     { label: 'Thursday From', group: 'Operating Hours' },
    thursdayAvailabilityEndTime:       { label: 'Thursday To', group: 'Operating Hours' },
    fridayAvailabilityStartTime:       { label: 'Friday From', group: 'Operating Hours' },
    fridayAvailabilityEndTime:         { label: 'Friday To', group: 'Operating Hours' },
    saturdayAvailabilityStartTime:     { label: 'Saturday From', group: 'Operating Hours' },
    saturdayAvailabilityEndTime:       { label: 'Saturday To', group: 'Operating Hours' },
  },

  'User': {
    name:                      { label: 'Name' },
    email:                     { label: 'Email', type: 'email' },
    userTypeID:                { label: 'User type', lookup: { endpoint: '/v1/user-types', searchParam: 'search' } },
    accessibleBuildingIDs:     { label: 'Building access', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search', isArray: true } },
    phone:                     { label: 'Phone' },
    laborRate:                 { label: 'Labor rate', type: 'number' },
    isContact:                 { label: 'Is contact' },
    isSupplier:                { label: 'Is supplier' },
    canBeDriver:               { label: 'Can be a driver' },
    password:                  { label: 'Password' },
    requirePasswordChange:     { label: 'Require password change' },
    assignedEquipmentItemIDs:  { label: 'Assigned Equipment', lookup: { endpoint: '/v1/equipment', searchParam: 'search', isArray: true } },
  },

  'Work Request': {
    name:              { label: 'Name' },
    buildingID:        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    requestTypeID:     { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' } },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    otherLocation:     { label: 'Other Location' },
    latitude:          { label: 'Latitude', type: 'number' },
    longitude:         { label: 'Longitude', type: 'number' },
    onBehalfOfUserID:  { label: 'On Behalf Of', lookup: { endpoint: '/v1/users', searchParam: 'search' } },
    equipmentItemIDs:  { label: 'Equipment Items', lookup: { endpoint: '/v1/equipment', searchParam: 'search', isArray: true } },
    dueDate:           { label: 'Due Date', type: 'date' },
    parentRequestID:   { label: 'Parent Request', lookup: { endpoint: '/v1/maintenance-requests', searchParam: 'search' } },
    childRequestIDs:   { label: 'Child Requests', lookup: { endpoint: '/v1/maintenance-requests', searchParam: 'search', isArray: true } },
    blockedByRequestIDs: { label: 'Blocked By', lookup: { endpoint: '/v1/maintenance-requests', searchParam: 'search', isArray: true } },
    blockingRequestIDs:  { label: 'Blocking', lookup: { endpoint: '/v1/maintenance-requests', searchParam: 'search', isArray: true } },
    scheduledTimeBlock:  { label: 'Scheduled Time Block' },
    followingUserIDs:  { label: 'Following Users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    signature:         { label: 'Signature' },
  },

  'Schedule Request': {
    name:            { label: 'Name' },
    requestTypeID:   { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' } },
    buildingIDs:     { label: 'Buildings', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search', isArray: true } },
    otherResource:   { label: 'Other Resource' },
    isPrivate:       { label: 'Is Private' },
  },

  'Work Task': {
    name:              { label: 'Name' },
    requestTypeID:     { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' } },
    mode:              { label: 'Mode' },
    nextDueDate:       { label: 'Next Due Date', type: 'date' },
    buildingIDs:       { label: 'Buildings', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search', isArray: true } },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    equipmentItemIDs:  { label: 'Equipment Items', lookup: { endpoint: '/v1/equipment', searchParam: 'search', isArray: true } },
    assignedUserIDs:   { label: 'Assigned Users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    otherLocation:     { label: 'Other Location' },
  },

  'Transportation Request': {
    name:                        { label: 'Name' },
    requestTypeID:               { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' } },
    buildingID:                  { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    pickupLocationResourceID:    { label: 'Pickup Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    pickupLocation:              { label: 'Pickup Location Text' },
    onBehalfOfUserID:            { label: 'On Behalf Of' },
    destination:                 { label: 'Destination' },
    departureTimeUtc:            { label: 'Departure Time' },
    returnTimeUtc:               { label: 'Return Time' },
  },

  'Accounting Account': {
    name: { label: 'Name' },
  },

  // Inventory Type has no post-options endpoint in the current API but may appear.
  'Inventory Type': {
    name: { label: 'Name' },
  },
};

// --- Dependency cache key mapping ---
// Maps crossSheet labels to the dependency cache keys used by DEPENDENCY_TYPES.
const CROSS_SHEET_TO_DEP_KEY = {
  'Building':        'buildings',
  'Equipment Type':  'equipment-types',
  'Equipment':       'equipment',
  'Resource':        'resources',
  'User':            'users',
  'Request Type':    'request-types',
  'Inventory Type':  'inventory-types',
  'Inventory':       'inventory',
  'User Type':       'user-types',
  'Resource Type':   'resource-types',
};

// --- Builder ---

/**
 * Build field definitions by merging live systemFields from /post-options with
 * static enrichments. Returns an array matching the shape used throughout the app:
 *   { name, apiKey, required, type, crossSheet?, group?, maximumLength?,
 *     lookupConfig?, isPermitted }
 *
 * @param {string} schemaType  Base schema type (no module qualifier)
 * @param {Array}  systemFields  From /post-options: [{ key, label, isRequired, isPermitted, maximumLength }]
 * @returns {Array} Field definitions
 */
export function buildFieldDefinitions(schemaType, systemFields) {
  const enrichments = FMX_FIELD_ENRICHMENTS[schemaType];
  if (!enrichments || !Array.isArray(systemFields) || systemFields.length === 0) return null;

  const defs = [];

  for (const sf of systemFields) {
    if (sf.isPermitted === false) continue;

    const enrich = enrichments[sf.key] || {};
    const isLookup = !!enrich.lookup;

    const def = {
      name: enrich.label || sf.label,
      apiKey: isLookup ? null : sf.key,
      required: sf.isRequired || false,
      type: enrich.type || 'string',
    };

    if (enrich.crossSheet) def.crossSheet = enrich.crossSheet;
    if (enrich.group) def.group = enrich.group;
    if (enrich.special) def.special = enrich.special;
    if (sf.maximumLength) def.maximumLength = sf.maximumLength;

    if (isLookup) {
      def.lookupConfig = {
        endpoint: enrich.lookup.endpoint,
        idField: sf.key,
        searchParam: enrich.lookup.searchParam,
        isArray: enrich.lookup.isArray || false,
      };
    }

    defs.push(def);
  }

  return defs;
}

/**
 * Check whether enrichments exist for a given schema type.
 */
export function hasEnrichments(schemaType) {
  return !!FMX_FIELD_ENRICHMENTS[schemaType];
}

// --- Derived maps (drop-in replacements for FMX_FIELD_MAP / FMX_ID_LOOKUP_FIELDS) ---

/**
 * Derive a { [fieldName]: apiKey } map from dynamic field definitions.
 * Covers non-lookup fields only (where apiKey !== null).
 */
export function deriveFieldMap(fieldDefs) {
  const map = {};
  for (const f of fieldDefs) {
    if (f.apiKey) map[f.name] = f.apiKey;
  }
  return map;
}

/**
 * Derive a { [fieldName]: { endpoint, idField, searchParam, isArray } } map
 * from dynamic field definitions. Covers lookup fields only.
 */
export function deriveLookupFields(fieldDefs) {
  const map = {};
  for (const f of fieldDefs) {
    if (f.lookupConfig) map[f.name] = f.lookupConfig;
  }
  return map;
}

/**
 * Derive dependency cache keys needed for a set of field definitions.
 * Returns string[] of dep keys (e.g. ['buildings', 'equipment-types']).
 */
export function deriveDepKeys(fieldDefs) {
  const keys = new Set();
  for (const f of fieldDefs) {
    if (f.crossSheet && CROSS_SHEET_TO_DEP_KEY[f.crossSheet]) {
      keys.add(CROSS_SHEET_TO_DEP_KEY[f.crossSheet]);
    }
    // Also include dep keys for lookup fields without crossSheet
    if (f.lookupConfig) {
      const depKey = Object.entries(CROSS_SHEET_TO_DEP_KEY)
        .find(([, v]) => f.lookupConfig.endpoint.includes(`/v1/${v}`))?.[1];
      if (depKey) keys.add(depKey);
    }
  }
  return [...keys];
}

export { FMX_FIELD_ENRICHMENTS };
