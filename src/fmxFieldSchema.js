// DEPRECATED: Use buildFieldDefinitions() from fmxFieldMetadata.js for dynamic field definitions.
// Retained as fallback when systemFields from /post-options are unavailable.
// Fields with apiKey: null are resolved via FMX_ID_LOOKUP_FIELDS in fmxEndpoints.js.

export const FMX_API_STANDARD_FIELDS = {
  'Building': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Address', apiKey: 'address', required: false, type: 'string' },
    { name: 'Latitude', apiKey: 'latitude', required: false, type: 'number' },
    { name: 'Longitude', apiKey: 'longitude', required: false, type: 'number' },
    { name: 'Phone', apiKey: 'phone', required: false, type: 'string' },
    { name: 'Tax rate', apiKey: 'taxRate', required: false, type: 'number' },
    { name: 'Sunday From', apiKey: 'sundayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Sunday To', apiKey: 'sundayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Monday From', apiKey: 'mondayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Monday To', apiKey: 'mondayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Tuesday From', apiKey: 'tuesdayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Tuesday To', apiKey: 'tuesdayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Wednesday From', apiKey: 'wednesdayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Wednesday To', apiKey: 'wednesdayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Thursday From', apiKey: 'thursdayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Thursday To', apiKey: 'thursdayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Friday From', apiKey: 'fridayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Friday To', apiKey: 'fridayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Saturday From', apiKey: 'saturdayOperatingHoursStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Saturday To', apiKey: 'saturdayOperatingHoursEndTime', required: false, type: 'string', group: 'Operating Hours' },
  ],
  'Equipment Type': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Track meters', apiKey: 'trackMeters', required: false, type: 'string' },
    { name: 'Track downtime', apiKey: 'trackDowntime', required: false, type: 'string' },
    { name: 'Track asset lifespan', apiKey: 'trackAssetLifespan', required: false, type: 'string' },
  ],
  'Equipment': [
    { name: 'Tag', apiKey: 'tag', required: true, type: 'string' },
    { name: 'Type', apiKey: null, required: true, type: 'string', crossSheet: 'Equipment Type' },
    { name: 'Building', apiKey: null, required: true, type: 'string', crossSheet: 'Building' },
    { name: 'Location', apiKey: null, required: false, type: 'string' },           // ID lookup → locationResourceID
    { name: 'Parent Equipment', apiKey: null, required: false, type: 'string' },   // ID lookup → parentEquipmentID
    { name: 'Downtime calculation start date', apiKey: 'downtimeCalculationStartDate', required: false, type: 'date' },
    { name: 'Asset Condition', apiKey: 'assetCondition', required: false, type: 'string' }, // enum coercion in transform
    { name: 'Barcode ID', apiKey: 'barcodeID', required: false, type: 'string' },
    { name: 'Cooling Capacity', apiKey: 'coolingCapacity', required: false, type: 'number' },
    { name: 'Date of Manufacture', apiKey: 'dateOfManufacture', required: false, type: 'date' },
    { name: 'Expected Replacement Cost', apiKey: 'expectedReplacementCost', required: false, type: 'number' },
    { name: 'Expected Replacement Date', apiKey: 'expectedReplacementDate', required: false, type: 'date' },
    { name: 'Filter size', apiKey: 'filterSize', required: false, type: 'string' },
    { name: 'Heating Capacity', apiKey: 'heatingCapacity', required: false, type: 'number' },
    { name: 'Installed Cost', apiKey: 'installedCost', required: false, type: 'number' },
    { name: 'Installed Date', apiKey: 'installedDate', required: false, type: 'date' },
    { name: 'Manufacturer', apiKey: 'manufacturer', required: false, type: 'string' },
    { name: 'Model number', apiKey: 'modelNumber', required: false, type: 'string' },
    { name: 'Serial number', apiKey: 'serialNumber', required: false, type: 'string' },
    { name: 'Budget Category', apiKey: 'budgetCategory', required: false, type: 'string' },
    { name: 'Estimated end-of-life (EOL)', apiKey: 'estimatedEndOfLife', required: false, type: 'date' },
    { name: 'Planned replacement date', apiKey: 'plannedReplacementDate', required: false, type: 'date' },
    { name: 'Replacement asset value', apiKey: 'replacementAssetValue', required: false, type: 'number' },
  ],
  'Inventory': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Type', apiKey: null, required: true, type: 'string' },                // ID lookup → inventoryTypeID
    { name: 'Building', apiKey: null, required: true, type: 'string', crossSheet: 'Building' },
    { name: 'Location', apiKey: null, required: false, type: 'string' },           // ID lookup → locationResourceID
    { name: 'Current quantity', apiKey: 'currentQuantity', required: true, type: 'number' },
    { name: 'SKU', apiKey: 'sku', required: false, type: 'string' },
    { name: 'Minimum quantity', apiKey: 'minimumQuantity', required: false, type: 'number' },
    { name: 'Unit price', apiKey: 'unitPrice', required: false, type: 'number' },
    { name: 'Barcode Number', apiKey: 'barcodeNumber', required: false, type: 'string' },
  ],
  'Resource': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Building', apiKey: null, required: true, type: 'string', crossSheet: 'Building' },
    { name: 'Address', apiKey: 'address', required: false, type: 'string' },
    { name: 'Latitude', apiKey: 'latitude', required: false, type: 'number' },
    { name: 'Longitude', apiKey: 'longitude', required: false, type: 'number' },
    { name: 'Resource type', apiKey: null, required: false, type: 'string' },      // Array ID lookup → resourceTypeIDs
    { name: 'Capacity', apiKey: 'capacity', required: false, type: 'number' },
    { name: 'Quantity', apiKey: 'scheduleRequestQuantity', required: false, type: 'number' },
    { name: 'Sunday From', apiKey: 'sundayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Sunday To', apiKey: 'sundayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Monday From', apiKey: 'mondayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Monday To', apiKey: 'mondayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Tuesday From', apiKey: 'tuesdayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Tuesday To', apiKey: 'tuesdayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Wednesday From', apiKey: 'wednesdayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Wednesday To', apiKey: 'wednesdayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Thursday From', apiKey: 'thursdayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Thursday To', apiKey: 'thursdayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Friday From', apiKey: 'fridayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Friday To', apiKey: 'fridayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Saturday From', apiKey: 'saturdayAvailabilityStartTime', required: false, type: 'string', group: 'Operating Hours' },
    { name: 'Saturday To', apiKey: 'saturdayAvailabilityEndTime', required: false, type: 'string', group: 'Operating Hours' },
  ],
  'User': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Email', apiKey: 'email', required: true, type: 'email' },
    { name: 'User type', apiKey: null, required: true, type: 'string' },           // ID lookup → userTypeID
    { name: 'Building access', apiKey: null, required: false, type: 'string', crossSheet: 'Building' }, // Array ID lookup → accessibleBuildingIDs
    { name: 'Phone', apiKey: 'phone', required: false, type: 'string' },
    { name: 'Labor rate', apiKey: 'laborRate', required: false, type: 'number' },
    { name: 'Is contact', apiKey: 'isContact', required: false, type: 'string' },
    { name: 'Is supplier', apiKey: 'isSupplier', required: false, type: 'string' },
    { name: 'Can be a driver', apiKey: 'canBeDriver', required: false, type: 'string' },
    { name: 'Assigned Equipment', apiKey: null, required: false, type: 'string' }, // Array ID lookup → assignedEquipmentItemIDs
  ],
  'Work Request': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Building', apiKey: null, required: true, type: 'string', crossSheet: 'Building' },
    { name: 'Request Type', apiKey: null, required: true, type: 'string' },        // ID lookup → requestTypeID
    { name: 'Location', apiKey: null, required: false, type: 'string' },           // ID lookup → locationResourceID
    { name: 'Other Location', apiKey: 'otherLocation', required: false, type: 'string' },
    { name: 'On Behalf Of', apiKey: null, required: false, type: 'string' },       // ID lookup → onBehalfOfUserID
    { name: 'Equipment Items', apiKey: null, required: false, type: 'string' },    // Array ID lookup → equipmentItemIDs
    { name: 'Due Date', apiKey: 'dueDate', required: false, type: 'date' },
    { name: 'Assigned Users', apiKey: null, required: false, type: 'string', group: 'Assignment' },  // Post-create assignment
    { name: 'Priority Level', apiKey: null, required: false, type: 'string', group: 'Assignment' },  // Post-create assignment
  ],
  'Schedule Request': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Request Type', apiKey: null, required: true, type: 'string' },        // ID lookup → requestTypeID
    { name: 'Buildings', apiKey: null, required: true, type: 'string', crossSheet: 'Building' }, // Array ID lookup → buildingIDs
    { name: 'Other Resource', apiKey: 'otherResource', required: false, type: 'string' },
    { name: 'Is Private', apiKey: 'isPrivate', required: false, type: 'string' },
  ],
  'Work Task': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Request Type', apiKey: null, required: true, type: 'string' },        // ID lookup → requestTypeID
    { name: 'Mode', apiKey: 'mode', required: false, type: 'string' },
    { name: 'Next Due Date', apiKey: 'nextDueDate', required: false, type: 'date' },
    { name: 'Buildings', apiKey: null, required: false, type: 'string', crossSheet: 'Building' }, // Array ID lookup → buildingIDs
    { name: 'Location', apiKey: null, required: false, type: 'string' },           // ID lookup → locationResourceID
    { name: 'Equipment Items', apiKey: null, required: false, type: 'string' },    // Array ID lookup → equipmentItemIDs
    { name: 'Assigned Users', apiKey: null, required: false, type: 'string' },    // Array ID lookup → assignedUserIDs
    { name: 'Other Location', apiKey: 'otherLocation', required: false, type: 'string' },
  ],
  'Transportation Request': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
    { name: 'Request Type', apiKey: null, required: true, type: 'string' },        // ID lookup → requestTypeID
    { name: 'Building', apiKey: null, required: true, type: 'string', crossSheet: 'Building' },
    { name: 'Pickup Location', apiKey: null, required: false, type: 'string' },    // ID lookup → pickupLocationResourceID
    { name: 'Pickup Location Text', apiKey: 'pickupLocation', required: false, type: 'string' },
    { name: 'On Behalf Of', apiKey: null, required: false, type: 'string' },       // ID lookup → onBehalfOfUserID (not in lookup table, text only)
    { name: 'Destination', apiKey: 'destination', required: false, type: 'string' },
    { name: 'Departure Time', apiKey: 'departureTimeUtc', required: false, type: 'string' },
    { name: 'Return Time', apiKey: 'returnTimeUtc', required: false, type: 'string' },
  ],
  'Accounting Account': [
    { name: 'Name', apiKey: 'name', required: true, type: 'string' },
  ],
};
