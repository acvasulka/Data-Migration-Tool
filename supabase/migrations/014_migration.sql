-- Migration 12: Extend prompting system to CSV field-mapping + cost/audit polish.
--
-- Round 4 changes:
--   • extraction_runs now tracks any admin-prompt invocation (not just PDF
--     extractions). Add a `stage` column so one table covers both
--     'extraction' and 'field_mapping' runs.
--   • Capture Claude token usage (in / out / estimated cost) so admins can
--     see per-run spend and bound the overall learning-loop cost.
--   • Allow a new `mapping_change` correction type — fires when a user
--     overrides the AI/heuristic mapping in the Map Fields step. Same
--     promote-to-example loop as PDF corrections.
--   • Seed default `field_mapping` prompts for the common migration types.
--
-- Additive & idempotent; safe to re-run.

-- ── extraction_runs: add stage + token/cost columns ───────────────────────
alter table extraction_runs
  add column if not exists stage text not null default 'extraction';
alter table extraction_runs
  add column if not exists input_tokens int;
alter table extraction_runs
  add column if not exists output_tokens int;
alter table extraction_runs
  add column if not exists estimated_cost_usd numeric(10, 6);

create index if not exists extraction_runs_stage_idx
  on extraction_runs(stage, created_at desc);

-- ── corrections: allow mapping_change type ────────────────────────────────
-- Check constraints can't be edited in-place; drop and re-add with the new value.
alter table corrections drop constraint if exists corrections_correction_type_check;
alter table corrections add constraint corrections_correction_type_check
  check (correction_type in ('header_rename','cell_edit','mapping_change','validate_edit'));

-- ── Seed default field_mapping prompts ────────────────────────────────────
-- The mapping prompt is invoked from App.js:suggestAndAdvance. The template
-- uses {{MIGRATION_TYPE}}, {{CSV_HEADERS}}, {{FMX_FIELDS}}, {{SUGGESTED}}
-- placeholders which src/promptTemplates.js interpolates at call time.

do $$
declare
  mt text;
  mapping_body text;
begin
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

  foreach mt in array array['Building','Resource','Equipment','Inventory','User'] loop
    if not exists (select 1 from prompts where migration_type = mt and stage = 'field_mapping') then
      insert into prompts (migration_type, stage, version, body, active, notes)
      values (mt, 'field_mapping', 1, replace(mapping_body, '{{MIGRATION_TYPE}}', mt), true, 'Seeded default');
    end if;
  end loop;
end $$;
