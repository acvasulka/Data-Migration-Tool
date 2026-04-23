-- Migration 020: Per-field prompts for the Equipment Label Property Upload.
--
-- Adds an optional `field_key` column to `prompts` so admins can author
-- field-specific guidance for the OCR stage. Existing rows keep field_key =
-- null (treated as the stage-level overall prompt and still the fallback when
-- no field-specific prompt exists).
--
-- Uniqueness is redefined to include the field_key dimension:
--   (migration_type, stage, coalesce(field_key,''), version)  unique
--   (migration_type, stage, coalesce(field_key,''))           unique WHERE active
-- coalesce keeps null field_key in its own bucket rather than being ignored.
--
-- Idempotent.

alter table prompts
  add column if not exists field_key text;

drop index if exists prompts_version_idx;
create unique index if not exists prompts_version_idx
  on prompts(migration_type, stage, coalesce(field_key, ''), version);

drop index if exists prompts_single_active_idx;
create unique index if not exists prompts_single_active_idx
  on prompts(migration_type, stage, coalesce(field_key, '')) where active;

drop index if exists prompts_lookup_idx;
create index if not exists prompts_lookup_idx
  on prompts(migration_type, stage, field_key, active);
