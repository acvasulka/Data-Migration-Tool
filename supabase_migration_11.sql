-- Migration 11: PDF extraction learning loop.
--
-- Adds two tables so the tool can improve over time without silently drifting:
--   • corrections       — raw user edits to OCR'd data. Captured whenever a user
--                         renames a header or edits a cell on a PDF-sourced
--                         preview (step 1 of the wizard). Tied to the
--                         extraction_run that produced the value.
--   • prompt_examples   — curated few-shot examples attached to a specific
--                         prompt (migration_type + stage). Injected into the
--                         Claude system prompt when `enabled = true`. Each is
--                         traceable back to the correction it was promoted
--                         from, so admins always see what the model is learning.
--
-- Pure additive; safe to re-run.

create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid references extraction_runs(id) on delete cascade,
  migration_type text not null,
  correction_type text not null check (correction_type in ('header_rename','cell_edit')),
  field_path text not null,            -- for header_rename: the original header; for cell_edit: '<header>' (row_index carries the rest)
  row_index int,                       -- null for header_rename
  original_value text,
  corrected_value text,
  user_id uuid references profiles(id) on delete set null,
  reviewed boolean not null default false,
  promoted_example_id uuid,            -- set once this correction is promoted — see prompt_examples.promoted_from_correction_id
  created_at timestamptz not null default now()
);

create index if not exists corrections_migration_type_idx on corrections(migration_type, created_at desc);
create index if not exists corrections_unreviewed_idx on corrections(migration_type, reviewed) where reviewed = false;

alter table corrections enable row level security;
drop policy if exists "authenticated users can access corrections" on corrections;
create policy "authenticated users can access corrections"
  on corrections for all using (auth.role() = 'authenticated');

create table if not exists prompt_examples (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  -- The example body is intentionally flexible JSON so admins can later
  -- shape examples however the current prompt design needs:
  --   { "input": "text describing a page", "output": { "fields": [...], "rows": [...] } }
  -- or for targeted corrections:
  --   { "hint": "Label 'Asset Tag' is the equipment's FMX 'Serial Number' field" }
  example_json jsonb not null,
  label text,                          -- short admin-facing name ("Asset Tag → Serial Number")
  enabled boolean not null default true,
  promoted_from_correction_id uuid references corrections(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  use_count int not null default 0,    -- bumped by the client each time it injects this example
  last_used_at timestamptz
);

create index if not exists prompt_examples_prompt_idx on prompt_examples(prompt_id, enabled);

alter table prompt_examples enable row level security;
drop policy if exists "authenticated users can read prompt_examples" on prompt_examples;
create policy "authenticated users can read prompt_examples"
  on prompt_examples for select using (auth.role() = 'authenticated');
drop policy if exists "admins can write prompt_examples" on prompt_examples;
create policy "admins can write prompt_examples"
  on prompt_examples for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Close the loop on corrections: when an example is deleted, clear the
-- pointer back on the correction so it becomes promotable again.
create or replace function clear_correction_promotion() returns trigger as $$
begin
  update corrections
    set promoted_example_id = null
    where promoted_example_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists prompt_examples_cleanup on prompt_examples;
create trigger prompt_examples_cleanup
  before delete on prompt_examples
  for each row execute function clear_correction_promotion();
