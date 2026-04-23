-- Migration 022: Revert the Equipment OCR stage prompt to v1 (pre-bbox).
--
-- The v2 prompt introduced per-field `bbox` and numeric confidence so the
-- UI could draw an extraction region on the source image. In practice vision
-- models' bbox output was too imprecise to be useful, so the highlight
-- feature was removed. This migration deactivates v2 and reactivates v1 —
-- the original string-confidence prompt without bbox — so the UI and prompt
-- are in sync again.
--
-- Idempotent: safe to re-run. Leaves per-field (field_key IS NOT NULL)
-- prompts untouched.

do $$
begin
  -- Deactivate v2 stage-level prompt if still active.
  update prompts
     set active = false
   where migration_type = 'Equipment'
     and stage = 'ocr'
     and field_key is null
     and version = 2
     and active = true;

  -- Reactivate v1 stage-level prompt. The partial unique index
  -- prompts_single_active_idx allows only one active row per
  -- (migration_type, stage, coalesce(field_key, '')), so v2 must be
  -- deactivated first (above) before this flip.
  if exists (
    select 1 from prompts
     where migration_type = 'Equipment'
       and stage = 'ocr'
       and field_key is null
       and version = 1
  ) then
    update prompts
       set active = true
     where migration_type = 'Equipment'
       and stage = 'ocr'
       and field_key is null
       and version = 1;
  end if;
end $$;
