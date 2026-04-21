-- Migration 9: project_pushes table — tracks each FMX API push so it can be undone.
--
-- A "push" is one batch of records sent to FMX via the Send-to-FMX modal.
-- Undoing a create-push = DELETE each captured FMX ID.
-- Undoing an update-push = PUT each record back to its pre-push snapshot.
--
-- Only 'create' and 'update' pushes are persisted. Delete pushes are not reversible.
-- Idempotent — safe to re-run.

create table if not exists project_pushes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  schema_type text not null,
  mode text not null check (mode in ('create', 'update')),
  fmx_site_url text not null,
  endpoint_base text not null,
  created_ids jsonb,            -- { "0": 12345, "3": 12346 } for create-push
  update_snapshots jsonb,       -- [{ id, body }] for update-push
  row_count int not null,
  succeeded int not null,
  failed int not null,
  pushed_at timestamptz not null default now(),
  undone_at timestamptz,
  undo_result jsonb             -- { reversed, failed, failures: [...] }
);

create index if not exists project_pushes_project_id_pushed_at_idx
  on project_pushes(project_id, pushed_at desc);

alter table project_pushes enable row level security;

drop policy if exists "authenticated users can access project_pushes" on project_pushes;
create policy "authenticated users can access project_pushes"
  on project_pushes for all using (auth.role() = 'authenticated');
