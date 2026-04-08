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

export { FMX_ENDPOINTS };
