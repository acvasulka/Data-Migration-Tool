-- Run this in your Supabase SQL editor to add credential storage and FMX reference cache

-- Add credential storage and connection verification to projects table
alter table projects add column if not exists fmx_credentials text;
alter table projects add column if not exists fmx_connection_verified boolean default false;

-- Create FMX reference cache table for storing live-synced custom fields and reference data
create table if not exists fmx_reference_cache (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  schema_type text not null,
  data jsonb not null default '{}',
  fetched_at timestamptz default now() not null,
  unique(project_id, schema_type)
);

alter table fmx_reference_cache enable row level security;

create policy "authenticated users can access fmx cache" on fmx_reference_cache
  for all to authenticated using (true) with check (true);
