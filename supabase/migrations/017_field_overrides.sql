-- Migration 017: Admin-editable field overrides.
--
-- Today, "required" for an FMX field resolves as:
--   sf.isRequired (from /post-options)  ||  FMX_FIELD_ENRICHMENTS[…].isRequired  ||  false
-- Both inputs are code-owned — fixing a misclassified required flag needs a
-- redeploy. This table introduces a third, highest-priority input:
--
--   admin override  >  API (/post-options)  >  enrichment registry default  >  false
--
-- `schema_type` is either a base entity ("Work Task") or a module-qualified
-- variant ("Work Task:fit-inspections"). The lookup at read time prefers the
-- qualified row when present, falling back to the base row.
--
-- `is_required = null` means "no opinion, defer to API / enrichment default".
-- This lets admins create a notes-only row without forcing a required value.
--
-- Additive & idempotent; safe to re-run.

create table if not exists field_overrides (
  id           uuid primary key default gen_random_uuid(),
  schema_type  text not null,
  field_name   text not null,        -- FMX API field key, e.g. 'buildingID'
  is_required  boolean,              -- null = no override on requiredness
  notes        text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (schema_type, field_name)
);

create index if not exists field_overrides_schema_idx
  on field_overrides(schema_type);

alter table field_overrides enable row level security;

-- All authenticated users can read overrides (they drive validation UI).
drop policy if exists "authenticated users can read field_overrides" on field_overrides;
create policy "authenticated users can read field_overrides"
  on field_overrides for select using (auth.role() = 'authenticated');

-- Only admins can write.
drop policy if exists "admins can write field_overrides" on field_overrides;
create policy "admins can write field_overrides"
  on field_overrides for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Keep updated_at fresh on every write.
create or replace function set_field_overrides_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists field_overrides_set_updated_at on field_overrides;
create trigger field_overrides_set_updated_at
  before update on field_overrides
  for each row execute function set_field_overrides_updated_at();
