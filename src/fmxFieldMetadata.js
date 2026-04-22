// Dynamic field-definition builder.
// Merges live systemFields from the FMX /post-options API with a thin static
// enrichment layer that carries only what the API doesn't provide: field types,
// UI groups, crossSheet relationships, lookup endpoints, and special handling.
//
// This replaces the fully-hardcoded FMX_API_STANDARD_FIELDS in fmxFieldSchema.js
// and the FMX_FIELD_MAP / FMX_ID_LOOKUP_FIELDS in fmxEndpoints.js.
//
// Enrichment keys for synthetic fields must match GET OPTIONS sortKey names
// so the synthetic field mechanism in syncFmxDataForProject picks them up.

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
    // isRequired entries on enrichments are a FALLBACK: when the API's
    // post-options response reports `isRequired`, that wins (see
    // buildFieldDefinitions). Enrichment covers entities whose post-options
    // endpoint is missing or doesn't use the systemFields shape — notably
    // Resource, which only exposes get-options without isRequired flags.
    name:                                  { label: 'Name', isRequired: true },
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
    name:              { label: 'Name', isRequired: true },
    trackMeters:       { label: 'Track meters' },
    trackDowntime:     { label: 'Track downtime' },
    trackAssetLifespan:{ label: 'Track asset lifespan' },
  },

  'Equipment': {
    tag:                          { label: 'Tag', isRequired: true },
    equipmentTypeID:              { label: 'Type', crossSheet: 'Equipment Type', lookup: { endpoint: '/v1/equipment-types', searchParam: 'search' }, isRequired: true },
    buildingID:                   { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' }, isRequired: true },
    locationResourceID:           { label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    parentEquipmentID:            { label: 'Parent Equipment', lookup: { endpoint: '/v1/equipment', searchParam: 'search' } },
    inventoryItemIDs:             { label: 'Inventory items', lookup: { endpoint: '/v1/inventory', searchParam: 'search', isArray: true } },
    assignedUserIDs:              { label: 'Assigned users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    downtimeCalculationStartDate: { label: 'Downtime calculation start date', type: 'date' },
    assetCondition:               { label: 'Asset Condition', special: 'assetConditionEnum' },
  },

  'Inventory': {
    name:              { label: 'Name', isRequired: true },
    inventoryTypeID:   { label: 'Type', lookup: { endpoint: '/v1/inventory-types', searchParam: 'search' }, isRequired: true },
    buildingID:        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' }, isRequired: true },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    currentQuantity:   { label: 'Current quantity', type: 'number' },
    sku:               { label: 'SKU' },
    minimumQuantity:   { label: 'Minimum quantity', type: 'number' },
    unitPrice:         { label: 'Unit price', type: 'number' },
    barcodeNumber:     { label: 'Barcode Number' },
  },

  'Resource': {
    name:                              { label: 'Name', isRequired: true },
    buildingID:                        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' }, isRequired: true },
    address:                           { label: 'Address' },
    latitude:                          { label: 'Latitude', type: 'number' },
    longitude:                         { label: 'Longitude', type: 'number' },
    resourceTypeIDs:                   { label: 'Resource type', lookup: { endpoint: '/v1/resource-types', searchParam: 'search', isArray: true } },
    capacity:                          { label: 'Capacity', type: 'number' },
    scheduleRequestQuantity:           { label: 'Quantity', type: 'number' },
    isLocation:                        { label: 'Is location' },
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
    name:                      { label: 'Name', isRequired: true },
    email:                     { label: 'Email', type: 'email', isRequired: true },
    userTypeID:                { label: 'User type', lookup: { endpoint: '/v1/user-types', searchParam: 'search' }, isRequired: true },
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
    name:              { label: 'Name', isRequired: true },
    buildingID:        { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' }, isRequired: true },
    requestTypeID:     { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' }, isRequired: true },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    otherLocation:     { label: 'Other Location' },
    latitude:          { label: 'Latitude', type: 'number' },
    longitude:         { label: 'Longitude', type: 'number' },
    onBehalfOfUserID:  { label: 'On Behalf Of', lookup: { endpoint: '/v1/users', searchParam: 'search' } },
    equipmentItemIDs:  { label: 'Equipment Items', lookup: { endpoint: '/v1/equipment', searchParam: 'search', isArray: true } },
    dueDate:           { label: 'Due Date', type: 'date' },
    // Self-referential lookups: the {module} token is resolved at call time in
    // buildIdCache using the current row's schemaType. Self-references are always
    // within the same work-request module.
    parentRequestID:   { label: 'Parent Request', lookup: { endpoint: '/v1/{module}-requests', searchParam: 'search' } },
    childRequestIDs:   { label: 'Child Requests', lookup: { endpoint: '/v1/{module}-requests', searchParam: 'search', isArray: true } },
    blockedByRequestIDs: { label: 'Blocked By', lookup: { endpoint: '/v1/{module}-requests', searchParam: 'search', isArray: true } },
    blockingRequestIDs:  { label: 'Blocking', lookup: { endpoint: '/v1/{module}-requests', searchParam: 'search', isArray: true } },
    scheduledTimeBlock:  { label: 'Scheduled Time Block' },
    followingUserIDs:  { label: 'Following Users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    signature:         { label: 'Signature' },
    // TODO (CLAUDE.md §8b): `requestedInventoryLogs` (array) is documented on
    // WorkRequestEditModel but not yet surfaced here. Add when a user needs to import
    // inventory-log entries alongside a work request; shape per §8b is underspecified.
  },

  'Schedule Request': {
    name:               { label: 'Name', isRequired: true },
    requestTypeID:      { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' }, isRequired: true },
    buildingIDs:        { label: 'Buildings', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search', isArray: true }, isRequired: true },
    resourceQuantities: { label: 'Resources', lookup: { endpoint: '/v1/resources', searchParam: 'search', isArray: true } },
    otherResource:      { label: 'Other Resource' },
    isPrivate:          { label: 'Is Private' },
    // Date/time fields from GET OPTIONS sortKeys (not in post-options systemFields)
    'event-time':       { label: 'Event Time' },
    'reservation-time': { label: 'Reservation Time' },
    'setup-duration':   { label: 'Setup Time' },
    'teardown-duration':{ label: 'Teardown Time' },
    // firstOccurrenceEventTimeBlock (flat fields — dot-notation composed in transform)
    'firstOccurrenceEventTimeBlock.startDate':    { label: 'Event Start Date',     type: 'date' },
    'firstOccurrenceEventTimeBlock.endDate':      { label: 'Event End Date',       type: 'date' },
    'firstOccurrenceEventTimeBlock.startTimeUtc': { label: 'Event Start Time' },
    'firstOccurrenceEventTimeBlock.endTimeUtc':   { label: 'Event End Time'   },
    // schedule / recurrence (flat fields — dot-notation composed in transform)
    'schedule.frequency':         { label: 'Recurrence Frequency' },
    'schedule.interval':          { label: 'Recurrence Interval',  type: 'number' },
    'schedule.weeklyDaysOfWeek':  { label: 'Recurrence Days' },
    'schedule.monthlyRecurrence': { label: 'Monthly Recurrence' },
    'schedule.endDate':           { label: 'Recurrence End Date',  type: 'date' },
    'schedule.endCount':          { label: 'Recurrence End Count', type: 'number' },
  },

  'Work Task': {
    name:              { label: 'Name', isRequired: true },
    requestTypeID:     { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' }, isRequired: true },
    instructionSetID:  { label: 'Instruction Set', lookup: { endpoint: '/v1/{module}/instruction-sets', searchParam: 'search' } },
    mode:              { label: 'Mode' },
    nextDueDate:       { label: 'Next Due Date', type: 'date' },
    buildingIDs:       { label: 'Buildings', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search', isArray: true } },
    locationResourceID:{ label: 'Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    equipmentItemIDs:  { label: 'Equipment Items', lookup: { endpoint: '/v1/equipment', searchParam: 'search', isArray: true } },
    assignedUserIDs:   { label: 'Assigned Users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    otherLocation:     { label: 'Other Location' },
  },

  'Transportation Request': {
    name:                        { label: 'Name', isRequired: true },
    requestTypeID:               { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' }, isRequired: true },
    buildingID:                  { label: 'Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' }, isRequired: true },
    pickupLocationResourceID:    { label: 'Pickup Location', lookup: { endpoint: '/v1/resources', searchParam: 'search' } },
    pickupLocation:              { label: 'Pickup Location Text' },
    onBehalfOfUserID:            { label: 'On Behalf Of' },
    destination:                 { label: 'Destination' },
    departureTimeUtc:            { label: 'Departure Time' },
    returnTimeUtc:               { label: 'Return Time' },
  },

  'Accounting Account': {
    name: { label: 'Name', isRequired: true },
  },

  'Requisition': {
    title:            { label: 'Title', isRequired: true },
    requestTypeID:    { label: 'Request Type', lookup: { endpoint: '/v1/request-types', searchParam: 'search' }, isRequired: true },
    dueDate:          { label: 'Due Date', type: 'date' },
    memo:             { label: 'Memo' },
    supplierUserID:   { label: 'Supplier', lookup: { endpoint: '/v1/users', searchParam: 'search' } },
    supplierName:     { label: 'Supplier Name' },
    supplierEmail:    { label: 'Supplier Email', type: 'email' },
    supplierAddress:  { label: 'Supplier Address' },
    billToName:       { label: 'Bill To Name' },
    billToBuildingID: { label: 'Bill To Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    billToAddress:    { label: 'Bill To Address' },
    shipToName:       { label: 'Ship To Name' },
    shipToBuildingID: { label: 'Ship To Building', crossSheet: 'Building', lookup: { endpoint: '/v1/buildings', searchParam: 'search' } },
    shipToAddress:    { label: 'Ship To Address' },
    followingUserIDs: { label: 'Following Users', lookup: { endpoint: '/v1/users', searchParam: 'search', isArray: true } },
    shippingCost:     { label: 'Shipping Cost', type: 'number' },
    discount:         { label: 'Discount', type: 'number' },
  },

  'Inventory Adjustment': {
    inventoryID:          { label: 'Inventory Item', crossSheet: 'Inventory', lookup: { endpoint: '/v1/inventory', searchParam: 'search' }, isRequired: true },
    name:                 { label: 'Name' },
    adjustment:           { label: 'Adjustment', type: 'number', isRequired: true },
    transactionUnitPrice: { label: 'Unit Price', type: 'number' },
    updateUnitPrice:      { label: 'Update Unit Price' },
    description:          { label: 'Description' },
  },

  'Inventory Transfer': {
    inventoryID:          { label: 'From Inventory Item', crossSheet: 'Inventory', lookup: { endpoint: '/v1/inventory', searchParam: 'search' }, isRequired: true },
    otherInventoryItemID: { label: 'To Inventory Item', crossSheet: 'Inventory', lookup: { endpoint: '/v1/inventory', searchParam: 'search' }, isRequired: true },
    name:                 { label: 'Name' },
    transferredQuantity:  { label: 'Quantity', type: 'number', isRequired: true },
    transferToOtherItem:  { label: 'Transfer To Other Item' },
    transactionUnitPrice: { label: 'Unit Price', type: 'number' },
    updateUnitPrice:      { label: 'Update Unit Price' },
    description:          { label: 'Description' },
  },

  'Equipment Log': {
    equipmentID:   { label: 'Equipment', crossSheet: 'Equipment', lookup: { endpoint: '/v1/equipment', searchParam: 'search' }, isRequired: true },
    name:          { label: 'Name', isRequired: true },
    cost:          { label: 'Cost', type: 'number' },
    description:   { label: 'Description' },
  },

  'Utility Provider': {
    name:                         { label: 'Name', isRequired: true },
    utilityTypeID:                { label: 'Utility Type', type: 'number' },
    repeatInterval:               { label: 'Repeat Interval' },
    isConsumptionTracked:         { label: 'Track Consumption' },
    consumptionUnit:              { label: 'Consumption Unit' },
    isConsumptionSplitByMeter:    { label: 'Consumption Split By Meter' },
    isDemandTracked:              { label: 'Track Demand' },
    demandUnit:                   { label: 'Demand Unit' },
    isDemandSplitByMeter:         { label: 'Demand Split By Meter' },
    isEnergyUseIntensityTracked:  { label: 'Track Energy Use Intensity' },
    kbtuConversionFactor:         { label: 'KBTU Conversion Factor', type: 'number' },
    isWaterUseIntensityTracked:   { label: 'Track Water Use Intensity' },
    gallonConversionFactor:       { label: 'Gallon Conversion Factor', type: 'number' },
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
  'Inventory':       'inventory',
  'User Type':       'user-types',
  'Resource Type':   'resource-types',
};

// Which dep keys each schema base type needs for cross-field validation.
// null = not in map = fetch all (safe default for unknown types).
const SCHEMA_DEP_KEYS = {
  'Building':               [],
  'Resource':               ['buildings', 'resource-types'],
  'User':                   ['buildings', 'user-types'],
  'Equipment Type':         [],
  'Equipment':              ['buildings', 'equipment-types', 'resources', 'equipment', 'inventory', 'users'],
  'Inventory':              ['buildings', 'inventory-types'],
  'Work Request':           ['buildings', 'users', 'resources', 'request-types'],
  'Schedule Request':       ['buildings', 'resources', 'request-types'],
  'Work Task':              ['buildings', 'users', 'equipment', 'request-types'],
  'Transportation Request': ['buildings', 'resources', 'request-types'],
  'Accounting Account':     [],
  'Requisition':            ['buildings', 'users', 'request-types'],
  'Utility Provider':       [],
  'Equipment Log':          ['equipment'],
  'Inventory Adjustment':   ['inventory'],
  'Inventory Transfer':     ['inventory'],
};

/** Returns the dep keys needed for a given schema type, or null if unknown (fetch all). */
export function getDepKeysForSchema(schemaType) {
  if (!schemaType) return null;
  const base = schemaType.indexOf(':') === -1 ? schemaType : schemaType.slice(0, schemaType.indexOf(':'));
  const keys = SCHEMA_DEP_KEYS[base];
  return Array.isArray(keys) ? keys : null;
}

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
      // API-reported requiredness wins; enrichment fills in gaps for entities
      // whose post-options endpoint doesn't exist or doesn't carry the flag
      // (e.g. Resource — only /v1/resources/get-options is exposed).
      required: sf.isRequired || enrich.isRequired || false,
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
    if (f.lookupConfig) {
      const depKey = Object.entries(CROSS_SHEET_TO_DEP_KEY)
        .find(([, v]) => f.lookupConfig.endpoint.includes(`/v1/${v}`))?.[1];
      if (depKey) keys.add(depKey);
    }
  }
  return [...keys];
}

export { FMX_FIELD_ENRICHMENTS, SCHEMA_DEP_KEYS };
