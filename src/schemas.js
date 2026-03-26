export const IMPORT_ORDER = [
  "Building", "Resource", "User", "Equipment Type", "Equipment", "Inventory",
  "Work Request", "Schedule Request", "Work Task",
  "Transportation Request", "Accounting Account",
];

// ── Module-aware schema type helpers ────────────────────────────────────────

/** Strips the ":slug" suffix from a module-qualified schema type.
 *  e.g. "Work Request:maintenance" → "Work Request" */
export function getBaseSchemaType(schemaType) {
  if (!schemaType) return schemaType;
  const idx = schemaType.indexOf(':');
  return idx === -1 ? schemaType : schemaType.slice(0, idx);
}

/** Returns the module slug portion, or null for static types.
 *  e.g. "Work Request:maintenance" → "maintenance" */
export function getSchemaModuleSlug(schemaType) {
  if (!schemaType) return null;
  const idx = schemaType.indexOf(':');
  return idx === -1 ? null : schemaType.slice(idx + 1);
}

/** Human-readable card title for module-qualified types.
 *  e.g. "Work Request:maintenance" → "Work Request — Maintenance" */
export function getSchemaDisplayName(schemaType) {
  const base = getBaseSchemaType(schemaType);
  const slug = getSchemaModuleSlug(schemaType);
  if (!slug) return schemaType;
  return `${base} — ${slug.charAt(0).toUpperCase() + slug.slice(1)}`;
}

/** Builds a dynamic import order from fmxModules.
 *  Each work-request module becomes its own "Work Request:<slug>" entry (and a matching
 *  "Work Task:<slug>" entry), and each scheduling module becomes "Schedule Request:<slug>".
 *  Falls back to default single-module behaviour when fmxModules is null/undefined. */
export function getImportOrder(fmxModules) {
  const base = ["Building", "Resource", "User", "Equipment Type", "Equipment", "Inventory"];
  const wrMods = fmxModules?.workRequestModules  || [{ slug: 'maintenance', label: 'Maintenance' }];
  const srMods = fmxModules?.scheduleRequestModules || [{ slug: 'scheduling',  label: 'Scheduling'  }];
  return [
    ...base,
    ...wrMods.map(m => `Work Request:${m.slug}`),
    ...srMods.map(m => `Schedule Request:${m.slug}`),
    ...wrMods.map(m => `Work Task:${m.slug}`),   // work tasks mirror work-request modules
    "Transportation Request",
    "Accounting Account",
  ];
}

export const FMX_SCHEMAS = {
  Building: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Tax rate", required: false, type: "number" },
      { name: "Address", required: false, type: "string" },
      { name: "Latitude", required: false, type: "number" },
      { name: "Longitude", required: false, type: "number" },
      { name: "Phone", required: false, type: "string" },
      { name: "Entrances", required: false, type: "string" },
      { name: "Sunday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Sunday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Approval order (Standard)", required: false, type: "string", group: "Scheduling Periods" },
      { name: "Approval order (After hours)", required: false, type: "string", group: "Scheduling Periods" },
      { name: "Maintenance Name", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance From", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance To", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Planning Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Planning Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Test Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Test Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Transportation Approval order", required: false, type: "string", group: "Transportation Request Settings" },
    ],
    crossRef: "Name",
  },
  Resource: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Address", required: false, type: "string" },
      { name: "Latitude", required: false, type: "number" },
      { name: "Longitude", required: false, type: "number" },
      { name: "Location", required: false, type: "string" },
      { name: "Resource type", required: false, type: "string" },
      { name: "Capacity", required: false, type: "number" },
      { name: "Display Image", required: false, type: "string" },
      { name: "Sunday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Sunday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Schedulable", required: false, type: "string" },
      { name: "Requires approval", required: false, type: "string" },
      { name: "Requires estimating", required: false, type: "string" },
      { name: "Requires invoicing", required: false, type: "string" },
      { name: "Quantity", required: false, type: "number" },
      { name: "Disable conflicts", required: false, type: "string" },
      { name: "Permitted user types", required: false, type: "string" },
      { name: "Approval order 1 (Standard)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 1 (After hours)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 2 (Standard)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 2 (After hours)", required: false, type: "string", group: "Approval Order" },
      { name: "Pickup location", required: false, type: "string" },
    ],
    crossRef: null,
  },
  User: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Email", required: true, type: "email" },
      { name: "User type", required: true, type: "string" },
      { name: "Time zone", required: false, type: "string" },
      { name: "Password", required: false, type: "string" },
      { name: "Require password change", required: false, type: "string" },
      { name: "Building access", required: false, type: "string", crossSheet: "Building" },
      { name: "Phone", required: false, type: "string" },
      { name: "Alternative invoice recipient email", required: false, type: "email" },
      { name: "Labor rate", required: false, type: "number" },
      { name: "Can be a driver", required: false, type: "string" },
      { name: "Liability insurance expiration date", required: false, type: "date" },
      { name: "Is contact", required: false, type: "string" },
      { name: "Is supplier", required: false, type: "string" },
      { name: "Reports to", required: false, type: "string" },
      { name: "Assigned Equipment", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Equipment Type": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Modules", required: false, type: "string" },
      { name: "Track meters", required: false, type: "string" },
      { name: "Track downtime", required: false, type: "string" },
      { name: "Track asset lifespan", required: false, type: "string" },
      { name: "Permitted user types", required: false, type: "string" },
    ],
    crossRef: "Name",
  },
  Equipment: {
    fields: [
      { name: "Tag", required: true, type: "string" },
      { name: "Type", required: true, type: "string", crossSheet: "Equipment Type" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Location", required: false, type: "string" },
      { name: "Parent Equipment", required: false, type: "string" },
      { name: "Inventory items", required: false, type: "string" },
      { name: "Assigned users", required: false, type: "string" },
      { name: "Downtime calculation start date", required: false, type: "date" },
      { name: "Attachment IDs", required: false, type: "string" },
      { name: "Barcode ID", required: false, type: "string" },
      { name: "Cooling Capacity", required: false, type: "number" },
      { name: "Date of Manufacture", required: false, type: "date" },
      { name: "Expected Replacement Cost", required: false, type: "number" },
      { name: "Expected Replacement Date", required: false, type: "date" },
      { name: "Filter size", required: false, type: "string" },
      { name: "Heating Capacity", required: false, type: "number" },
      { name: "Installed Cost", required: false, type: "number" },
      { name: "Installed Date", required: false, type: "date" },
      { name: "Manufacturer", required: false, type: "string" },
      { name: "Model number", required: false, type: "string" },
      { name: "Serial number", required: false, type: "string" },
      { name: "Asset Condition", required: false, type: "string" },
      { name: "Installation date", required: false, type: "date" },
      { name: "Estimated end-of-life (EOL)", required: false, type: "date" },
      { name: "Planned replacement date", required: false, type: "date" },
      { name: "Replacement asset value", required: false, type: "number" },
      { name: "Budget Category", required: false, type: "string" },
    ],
    crossRef: null,
  },
  Inventory: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Type", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Location", required: true, type: "string" },
      { name: "Current quantity", required: true, type: "number" },
      { name: "SKU", required: false, type: "string" },
      { name: "Equipment items", required: false, type: "string" },
      { name: "Minimum quantity", required: false, type: "number" },
      { name: "Unit price", required: false, type: "number" },
      { name: "Assigned users", required: false, type: "string" },
      { name: "Suppliers", required: false, type: "string" },
      { name: "Image ID", required: false, type: "string" },
      { name: "Image alt text", required: false, type: "string" },
      { name: "Attachment IDs", required: false, type: "string" },
      { name: "Barcode Number", required: false, type: "string" },
      { name: "Image", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Work Request": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Request Type", required: true, type: "string" },
      { name: "Location", required: false, type: "string" },
      { name: "Other Location", required: false, type: "string" },
      { name: "On Behalf Of", required: false, type: "string" },
      { name: "Equipment Items", required: false, type: "string" },
      { name: "Due Date", required: false, type: "date" },
    ],
    crossRef: null,
  },
  "Schedule Request": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Request Type", required: true, type: "string" },
      { name: "Buildings", required: true, type: "string", crossSheet: "Building" },
      { name: "Resources", required: false, type: "string" },
      { name: "Other Resource", required: false, type: "string" },
      { name: "Is Private", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Work Task": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Request Type", required: true, type: "string" },
      { name: "Mode", required: false, type: "string" },
      { name: "Next Due Date", required: false, type: "date" },
      { name: "Buildings", required: false, type: "string", crossSheet: "Building" },
      { name: "Location", required: false, type: "string" },
      { name: "Equipment Items", required: false, type: "string" },
      { name: "Assigned Users", required: false, type: "string" },
      { name: "Other Location", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Transportation Request": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Request Type", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Pickup Location", required: false, type: "string" },
      { name: "Pickup Location Text", required: false, type: "string" },
      { name: "On Behalf Of", required: false, type: "string" },
      { name: "Destination", required: false, type: "string" },
      { name: "Departure Time", required: false, type: "string" },
      { name: "Return Time", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Accounting Account": {
    fields: [
      { name: "Name", required: true, type: "string" },
    ],
    crossRef: null,
  },
};
