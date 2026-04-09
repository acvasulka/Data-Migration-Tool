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
 *  Converts hyphenated slug to Title Case words.
 *  e.g. "Work Task:fit-inspections" → "Work Task — Fit Inspections" */
export function getSchemaDisplayName(schemaType) {
  const base = getBaseSchemaType(schemaType);
  const slug = getSchemaModuleSlug(schemaType);
  if (!slug) return schemaType;
  const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `${base} — ${title}`;
}

/** Returns true if the module for the given qualified schema type is marked disabled.
 *  normalizedModules should already be passed through normalizeModules().
 *  e.g. isModuleDisabled("Work Task:fit-inspections", mods) → true/false */
export function isModuleDisabled(schemaType, normalizedModules) {
  const slug = getSchemaModuleSlug(schemaType);
  if (!slug || !normalizedModules) return false;
  const base = getBaseSchemaType(schemaType);
  let list;
  if (base === 'Work Request')    list = normalizedModules.workRequestModules;
  else if (base === 'Schedule Request') list = normalizedModules.scheduleRequestModules;
  else if (base === 'Work Task')  list = normalizedModules.workTaskModules;
  if (!list) return false;
  const entry = list.find(m => m.slug === slug);
  return entry?.disabled === true;
}

/** Builds a dynamic import order from fmxModules.
 *  Work Requests, Schedule Requests, and Work Tasks each have their own independent
 *  module lists — one import card is generated per module per type.
 *  Falls back to single-module defaults when fmxModules is null/undefined/incomplete. */
export function getImportOrder(fmxModules) {
  const base = ["Building", "Resource", "User", "Equipment Type", "Equipment", "Inventory"];
  const wrMods = fmxModules?.workRequestModules    || [{ slug: 'maintenance', label: 'Maintenance' }];
  const srMods = fmxModules?.scheduleRequestModules || [{ slug: 'scheduling',  label: 'Scheduling'  }];
  const wtMods = fmxModules?.workTaskModules       || [{ slug: 'maintenance', label: 'Maintenance' }];
  return [
    ...base,
    ...wrMods.map(m => `Work Request:${m.slug}`),
    ...srMods.map(m => `Schedule Request:${m.slug}`),
    ...wtMods.map(m => `Work Task:${m.slug}`),    // independent from work requests
    "Transportation Request",
    "Accounting Account",
  ];
}
