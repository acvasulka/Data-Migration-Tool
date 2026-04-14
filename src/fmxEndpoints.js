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
  return base ? `${base}/post-options` : null;
}

export function resolveGetOptionsEndpoint(schemaType, modules) {
  const base = resolveEndpoint(schemaType, modules);
  return base ? `${base}/get-options` : null;
}

export function resolvePutOptionsEndpoint(schemaType, entityId, modules) {
  const base = resolveEndpoint(schemaType, modules);
  return base ? `${base}/${entityId}/put-options` : null;
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
