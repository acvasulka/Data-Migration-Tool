-- Migration 14: Dry-run support on extraction_runs.
--
-- Lets admins test a *draft* prompt body against a past run without affecting
-- production flows. Dry-runs log to the same extraction_runs table with
-- dry_run=true so cost/token accounting is unified, but they carry a
-- dry_run_source_run_id back-link so the editor UI can diff output against
-- the original run.
--
-- Additive & idempotent; safe to re-run.

alter table extraction_runs
  add column if not exists dry_run boolean not null default false;
alter table extraction_runs
  add column if not exists dry_run_source_run_id uuid
    references extraction_runs(id) on delete set null;

create index if not exists extraction_runs_dry_run_idx
  on extraction_runs(dry_run, created_at desc);
