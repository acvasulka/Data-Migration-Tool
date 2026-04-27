-- Migration 023: Per-(project, equipment, attachment) cache for Equipment OCR.
--
-- The Equipment Label Property Upload tool re-runs Claude vision on every
-- attachment every time the user revisits an equipment item. This table
-- caches what the model returned for each (project, equipment, attachment)
-- so repeat scans cost zero tokens and prior results can be recalled later.
--
-- The `fields` JSONB grows over time: when a re-scan returns additional
-- field labels, the upsert merges incoming into existing (`||`), so a single
-- attachment can accumulate Model + Serial + Capacity across multiple runs
-- without forcing a re-scan of fields it already covers.
--
-- FMX attachment IDs are stable (a re-upload gets a fresh ID), so caching
-- by attachment_id is safe — no staleness logic required.
--
-- Idempotent: safe to re-run.

create table if not exists equipment_ocr_results (
  id bigserial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  equipment_id text not null,
  attachment_id text not null,
  attachment_filename text,
  attachment_content_type text,
  -- Map of "<field label>" → { value, confidence, source_text, source_attachment_id }
  fields jsonb not null default '{}'::jsonb,
  last_run_id uuid references extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, equipment_id, attachment_id)
);

create index if not exists equipment_ocr_results_proj_eq_idx
  on equipment_ocr_results(project_id, equipment_id);

alter table equipment_ocr_results enable row level security;

drop policy if exists "authenticated users can access equipment_ocr_results"
  on equipment_ocr_results;
create policy "authenticated users can access equipment_ocr_results"
  on equipment_ocr_results for all using (auth.role() = 'authenticated');

-- Merge helper: insert-or-shallow-merge fields jsonb. Called from db.js via
-- supabase.rpc('merge_equipment_ocr_fields', ...). We can't express the
-- `fields = existing || excluded` merge through the supabase-js .upsert()
-- builder cleanly, so a SECURITY INVOKER function is the simplest path.
-- Incoming wins on key collision (intended — fresh values overwrite stale).
create or replace function merge_equipment_ocr_fields(
  p_project_id uuid,
  p_equipment_id text,
  p_attachment_id text,
  p_attachment_filename text,
  p_attachment_content_type text,
  p_fields_delta jsonb,
  p_last_run_id uuid
) returns equipment_ocr_results
language plpgsql
security invoker
as $$
declare
  result equipment_ocr_results;
begin
  insert into equipment_ocr_results (
    project_id, equipment_id, attachment_id,
    attachment_filename, attachment_content_type,
    fields, last_run_id
  ) values (
    p_project_id, p_equipment_id, p_attachment_id,
    p_attachment_filename, p_attachment_content_type,
    coalesce(p_fields_delta, '{}'::jsonb), p_last_run_id
  )
  on conflict (project_id, equipment_id, attachment_id) do update
    set fields = equipment_ocr_results.fields || coalesce(excluded.fields, '{}'::jsonb),
        attachment_filename = coalesce(excluded.attachment_filename, equipment_ocr_results.attachment_filename),
        attachment_content_type = coalesce(excluded.attachment_content_type, equipment_ocr_results.attachment_content_type),
        last_run_id = coalesce(excluded.last_run_id, equipment_ocr_results.last_run_id),
        updated_at = now()
  returning * into result;
  return result;
end $$;

grant execute on function merge_equipment_ocr_fields(
  uuid, text, text, text, text, jsonb, uuid
) to authenticated;
