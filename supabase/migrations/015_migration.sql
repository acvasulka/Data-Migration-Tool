-- Migration 13: Seed extraction + field_mapping prompts for every supported
-- import type, not just the top 5. Without an active prompt, the CSV mapping
-- flow silently falls back to a hardcoded inline prompt — so extraction_runs
-- aren't logged, corrections aren't captured, and admins have no way to tune
-- the prompt for that type. Seeding baselines for every type fixes that.
--
-- Types come from src/schemas.js IMPORT_ORDER. Additive & idempotent.

do $$
declare
  mt text;
  all_types text[] := array[
    'Building',
    'Resource',
    'User',
    'Equipment Type',
    'Equipment',
    'Inventory',
    'Work Request',
    'Schedule Request',
    'Work Task',
    'Transportation Request',
    'Accounting Account',
    'Requisition',
    'Utility Provider',
    'Equipment Log',
    'Inventory Adjustment',
    'Inventory Transfer'
  ];
  extraction_body text;
  mapping_body text;
begin
  -- ── Extraction (PDF vision) baseline ─────────────────────────────────────
  extraction_body := $prompt$You are extracting structured tabular data from PDF pages that contain {{MIGRATION_TYPE}} records exported from another system.

INPUTS
- One or more consecutive page images from a single PDF.

TASK
Identify the field labels that appear on these pages and extract one row per record. Records usually correspond to table rows, card-style blocks, or labeled sections.

OUTPUT
Return ONLY a JSON object with this exact shape:
{
  "fields": ["Label 1", "Label 2", ...],
  "rows": [{ "Label 1": "value", "Label 2": "value", ... }, ...],
  "notes": "optional free-form notes about ambiguity, blank pages, etc."
}

RULES
1. Use the labels as they appear on the page — do not rename, translate, or normalize them.
2. Every row should be keyed by the labels in "fields". Missing values → empty string "".
3. Prefer completeness: if a page clearly contains records, extract them even when formatting is irregular.
4. Never invent values or labels not present on the page.
5. Return ONLY the JSON object. No prose, no code fences, no explanations.$prompt$;

  -- ── Field-mapping (CSV column matching) baseline ─────────────────────────
  mapping_body := $prompt$You are mapping spreadsheet columns to FMX field names for a {{MIGRATION_TYPE}} data migration.

INPUTS
- CSV headers (from the user's file): {{CSV_HEADERS}}
- FMX field names (the target schema): {{FMX_FIELDS}}
- Heuristic pre-matches already made: {{SUGGESTED}}

TASK
Return a JSON object whose keys are FMX field names and whose values are the matching CSV column name (chosen from the CSV headers list), or null if no CSV column is a good match.

RULES
1. NEVER invent CSV headers — only use ones from the list above, verbatim.
2. NEVER invent FMX field names — only use ones from the list above, verbatim.
3. Prefer the heuristic pre-matches when they're plausible; only override when you have strong reason.
4. If an FMX field clearly maps to none of the CSV headers, value is null.
5. Match by meaning, not just string similarity — e.g. "Asset #" usually maps to "Serial Number", "Site" usually maps to "Building".

OUTPUT
Return ONLY the JSON object. No prose, no code fences, no explanations.$prompt$;

  foreach mt in array all_types loop
    -- Extraction prompt
    if not exists (select 1 from prompts where migration_type = mt and stage = 'extraction') then
      insert into prompts (migration_type, stage, version, body, active, notes)
      values (mt, 'extraction', 1, replace(extraction_body, '{{MIGRATION_TYPE}}', mt), true, 'Seeded default');
    end if;

    -- Field-mapping prompt
    if not exists (select 1 from prompts where migration_type = mt and stage = 'field_mapping') then
      insert into prompts (migration_type, stage, version, body, active, notes)
      values (mt, 'field_mapping', 1, replace(mapping_body, '{{MIGRATION_TYPE}}', mt), true, 'Seeded default');
    end if;
  end loop;
end $$;
