// FMX API endpoint map.
// NOTE: Module-qualified schema types — "Work Request:<slug>", "Schedule Request:<slug>",
// "Work Task:<slug>" — are resolved exclusively by resolveEndpoint()'s string-prefix
// branches below. They MUST NOT be added here.
// NOTE: "Inventory Type" is intentionally omitted: FMX does not document a create/update
// endpoint for inventory types (CLAUDE.md §9 lists only GETs). It is also not in
// IMPORT_ORDER (src/schemas.js), so it is unreachable from the import flow.
const FMX_ENDPOINTS = {
  'Building':               '/v1/buildings',
  'Resource':               '/v1/resources',
  'User':                   '/v1/users',
  'Equipment Type':         '/v1/equipment-types',
  'Equipment':              '/v1/equipment',
  'Inventory':              '/v1/inventory',
  'Transportation Request': '/v1/transportation-requests',
  'Accounting Account':     '/v1/accounting-accounts',
  'Requisition':            '/v1/requisitions',
  'Utility Provider':       '/v1/utility-providers',
  // Equipment Log is a nested resource: actual POST uses /v1/equipment/{equipmentID}/logs.
  // The base path below is used for get-options; the push flow injects the parent ID at runtime.
  'Equipment Log':          '/v1/equipment/{equipmentID}/logs',
  // Inventory sub-actions: nested under parent inventory item ID.
  'Inventory Adjustment':   '/v1/inventory/{inventoryID}/change-quantity',
  'Inventory Transfer':     '/v1/inventory/{inventoryID}/transfer-quantity',
};

// Resolves the endpoint for a schema type.
// Handles module-qualified types like "Work Request:maintenance" (slug embedded in key)
// and static string endpoints.
// `modules` kept in signature for call-site stability; no longer consulted.
export function resolveEndpoint(schemaType, modules) { // eslint-disable-line no-unused-vars
  // Module-qualified types — slug is embedded in the key after ":"
  if (schemaType.startsWith('Work Request:'))
    return `/v1/${schemaType.split(':')[1]}-requests`;
  if (schemaType.startsWith('Schedule Request:'))
    return `/v1/${schemaType.split(':')[1]}/requests`;
  if (schemaType.startsWith('Work Task:'))
    return `/v1/${schemaType.split(':')[1]}/tasks`;
  // Static string endpoints
  const ep = FMX_ENDPOINTS[schemaType];
  return ep || null;
}

export function resolvePostOptionsEndpoint(schemaType, modules) {
  const base = resolveEndpoint(schemaType, modules);
  // Nested resources with unresolved path tokens have no post-options endpoint
  if (!base || base.includes('{')) return null;
  return `${base}/post-options`;
}

export function resolveGetOptionsEndpoint(schemaType, modules) {
  const base = resolveEndpoint(schemaType, modules);
  // Nested resources with unresolved path tokens have no usable get-options at sync time
  if (!base || base.includes('{')) return null;
  return `${base}/get-options`;
}

export function resolvePutOptionsEndpoint(schemaType, entityId, modules) {
  const base = resolveEndpoint(schemaType, modules);
  return base ? `${base}/${entityId}/put-options` : null;
}

// Per-schema-type capability map — what push modes the FMX API actually supports.
// Source of truth: FMX OpenAPI spec. Update when the spec changes.
// Shape: { create: boolean, update: boolean, delete: boolean }
export const FMX_MODE_CAPABILITIES = {
  'Building':               { create: true,  update: false, delete: false },
  'Resource':               { create: true,  update: true,  delete: true  },
  'User':                   { create: true,  update: true,  delete: true  },
  'Equipment Type':         { create: true,  update: false, delete: false },
  'Equipment':              { create: true,  update: true,  delete: true  },
  'Inventory':              { create: true,  update: true,  delete: false },
  'Transportation Request': { create: true,  update: true,  delete: true  },
  'Accounting Account':     { create: true,  update: true,  delete: true  },
  'Requisition':            { create: true,  update: false, delete: false },
  'Utility Provider':       { create: true,  update: false, delete: false },
  'Equipment Log':          { create: true,  update: true,  delete: false },
  'Inventory Adjustment':   { create: true,  update: false, delete: false },
  'Inventory Transfer':     { create: true,  update: false, delete: false },
};

// Work Request:*, Schedule Request:*, Work Task:* all support C/U/D per FMX spec.
export function getModeCapabilities(schemaType) {
  if (!schemaType) return { create: false, update: false, delete: false };
  if (FMX_MODE_CAPABILITIES[schemaType]) return FMX_MODE_CAPABILITIES[schemaType];
  if (schemaType.startsWith('Work Request:')
   || schemaType.startsWith('Schedule Request:')
   || schemaType.startsWith('Work Task:')) {
    return { create: true, update: true, delete: true };
  }
  return { create: false, update: false, delete: false };
}

export function supportsMode(schemaType, mode) {
  return !!getModeCapabilities(schemaType)[mode];
}

// Assignment fields for Work Requests — these are separated from the main payload
// and posted to /v1/{module}-requests/{id}/assignments after creation.
const FMX_ASSIGNMENT_FIELDS = {
  'Work Request': {
    userField: 'Assigned Users',           // row field name containing user name(s)
    userEndpoint: '/v1/users',             // endpoint to resolve user IDs
    priorityField: 'Priority Level',       // row field name for priority
  },
};

export { FMX_ENDPOINTS, FMX_ASSIGNMENT_FIELDS };
