# Fix FMX API Field Mapping — Ensure All Fields Pull Through

## Context

The Data Migration Tool fetches field metadata from the FMX API (`/post-options` and `/get-options`), builds dynamic field maps, and uses them to transform CSV rows into FMX API payloads. The core transform pipeline (`transformRowToPayload` + `buildIdCache`) correctly accepts and uses dynamic field map overrides with static fallbacks. However, several gaps prevent all fields from making it through:

1. **Resource-types dependency is broken** — cache maps to wrong key, no dependency fetcher, schema dep list incomplete
2. **Custom field metadata is lost** — get-options is preferred but lacks `options`, `allowMultipleSelections`, `description` etc. from post-options
3. **Work Request enrichments are incomplete** — missing ~9 fields the FMX API supports (lat/lng, parent/child/blocking requests, scheduled time block, following users, signature)
4. **No logging when fields are dropped** — impossible to debug what's being silently skipped

## Changes

### 1. Fix resource-types dependency chain (3 files)

**`src/fmxTransform.js`** — Line 163: Change `'/v1/resource-types': 'resources'` → `'/v1/resource-types': 'resource-types'`

**`src/fmxSync.js`** — Add `{ key: 'resource-types', endpoint: '/v1/resource-types', label: 'Resource Types', nameField: 'name' }` to `DEPENDENCY_TYPES` array (~line 307). Change `SCHEMA_DEP_KEYS['Resource']` from `['buildings']` → `['buildings', 'resource-types']` (line 342).

**`src/fmxFieldMetadata.js`** — Add `'Resource Type': 'resource-types'` to `CROSS_SHEET_TO_DEP_KEY` (~line 194).

### 2. Fix custom field metadata merge (`src/fmxSync.js` ~line 279)

Replace the either/or merge with a proper enrichment merge:
```js
// Current: discards post-options entirely when get-options returns data
const customFields = getOpts.customFields.length > 0 ? getOpts.customFields : postOpts.customFields;

// Fixed: merge get-options (for IDs) with post-options (for rich metadata)
let customFields;
if (getOpts.customFields.length > 0) {
  const postById = {};
  for (const cf of postOpts.customFields) postById[cf.id] = cf;
  customFields = getOpts.customFields.map(cf => {
    const post = postById[cf.id];
    if (!post) return cf;
    return { ...cf, options: post.options || [], allowMultipleSelections: post.allowMultipleSelections || false,
      allowOtherOption: post.allowOtherOption || false, description: post.description || '', defaults: post.defaults || [] };
  });
} else {
  customFields = postOpts.customFields;
}
```

### 3. Add missing Work Request enrichments (`src/fmxFieldMetadata.js`)

Add to `FMX_FIELD_ENRICHMENTS['Work Request']`:
- `latitude` / `longitude` (type: 'number')
- `parentRequestID` (lookup → work requests)
- `childRequestIDs` (array lookup → work requests)
- `blockedByRequestIDs` / `blockingRequestIDs` (array lookup → work requests)
- `scheduledTimeBlock` (string)
- `followingUserIDs` (array lookup → users)
- `signature` (string)

Note: parent/child/blocking request lookups use a generic endpoint; the dynamic path from `/post-options` produces the correct module-specific endpoint.

### 4. Add dropped-field logging (`src/fmxTransform.js`)

In `transformRowToPayload`: track fields that match no path (custom field, standard, or lookup) and log a single `console.warn` per row with the list of unmapped field names.

In `buildIdCache`: log when a value cannot be resolved from cache or API search.

## Verification

1. Build project — no compile errors
2. Test with a Resource schema — verify resource types resolve from dependency cache
3. Test with Work Request — verify new enrichment fields appear in field definitions
4. Test push — check browser console for dropped-field warnings to confirm all CSV columns are accounted for
5. Test custom field with multi-select dropdown — verify `allowMultipleSelections` is preserved and values split correctly
