-- Migration 10: PDF-with-OCR extraction — admin-editable prompts + audit log.
--
-- Adds two tables supporting the new "upload a PDF, Claude extracts fields into
-- a spreadsheet" flow:
--   • prompts            — versioned, admin-editable prompts keyed by (migration_type, stage).
--                          Only one row per (migration_type, stage) is `active` at a time.
--   • extraction_runs    — audit log: which PDF, which prompt version, who ran it, result JSON.
--
-- Also creates the `pdf-uploads` Storage bucket so clients can upload PDFs
-- directly (bypassing the Vercel 4.5 MB serverless body limit) before the
-- client renders pages to images for Claude vision.
--
-- Idempotent — safe to re-run.

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  migration_type text not null,              -- 'Building', 'Resource', 'Equipment', 'Inventory', 'User', …
  stage text not null default 'extraction',  -- 'extraction' | (future: 'row_detection', 'field_mapping')
  version int not null default 1,
  body text not null,
  active boolean not null default false,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists prompts_lookup_idx on prompts(migration_type, stage, active);
create unique index if not exists prompts_version_idx on prompts(migration_type, stage, version);

-- Enforce: at most one active prompt per (migration_type, stage).
create unique index if not exists prompts_single_active_idx
  on prompts(migration_type, stage) where active;

alter table prompts enable row level security;
drop policy if exists "authenticated users can read prompts" on prompts;
create policy "authenticated users can read prompts"
  on prompts for select using (auth.role() = 'authenticated');
drop policy if exists "admins can write prompts" on prompts;
create policy "admins can write prompts"
  on prompts for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  migration_type text not null,
  storage_key text,                    -- path in `pdf-uploads` bucket
  source_filename text,
  page_count int,
  prompt_id uuid references prompts(id) on delete set null,
  prompt_version int,
  status text not null default 'pending' check (status in ('pending','running','complete','error')),
  result_json jsonb,                   -- { headers, rows }
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists extraction_runs_project_idx on extraction_runs(project_id, created_at desc);

alter table extraction_runs enable row level security;
drop policy if exists "authenticated users can access extraction_runs" on extraction_runs;
create policy "authenticated users can access extraction_runs"
  on extraction_runs for all using (auth.role() = 'authenticated');

-- Storage bucket for uploaded PDFs. Private bucket; clients upload with signed URLs.
insert into storage.buckets (id, name, public)
values ('pdf-uploads', 'pdf-uploads', false)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload pdfs" on storage.objects;
create policy "authenticated users can upload pdfs"
  on storage.objects for insert with check (
    bucket_id = 'pdf-uploads' and auth.role() = 'authenticated'
  );
drop policy if exists "authenticated users can read pdfs" on storage.objects;
create policy "authenticated users can read pdfs"
  on storage.objects for select using (
    bucket_id = 'pdf-uploads' and auth.role() = 'authenticated'
  );
drop policy if exists "authenticated users can delete pdfs" on storage.objects;
create policy "authenticated users can delete pdfs"
  on storage.objects for delete using (
    bucket_id = 'pdf-uploads' and auth.role() = 'authenticated'
  );

-- ── Seed default prompts for common migration types ────────────────────────
-- The default prompt is intentionally generic — admins tune per type over time.

do $$
declare
  mt text;
  default_body text;
begin
  default_body := $prompt$You are extracting structured tabular data from a page of a PDF report.
The report is an exported report describing {{MIGRATION_TYPE}} records for a facilities-management migration.

Your job:
1. Read the image of the page carefully (this is OCR + structure detection in one pass).
2. Identify the field labels (column headers) and the data rows on the page.
3. One PDF page may contain a header block plus many repeating rows — return every row you can read.
4. Normalize repeated section headers; do not emit them as data rows.
5. Preserve values EXACTLY as printed (do not invent, complete, or guess missing values — use null or empty string).

Return ONLY valid JSON with this shape:
{
  "fields": ["Field A", "Field B", ...],
  "rows": [
    { "Field A": "value1", "Field B": "value2" },
    ...
  ],
  "notes": "optional: anything unusual about this page"
}

No prose, no code fences. Just the JSON object.$prompt$;

  foreach mt in array array['Building','Resource','Equipment','Inventory','User'] loop
    if not exists (select 1 from prompts where migration_type = mt and stage = 'extraction') then
      insert into prompts (migration_type, stage, version, body, active, notes)
      values (mt, 'extraction', 1, replace(default_body, '{{MIGRATION_TYPE}}', mt), true, 'Seeded default');
    end if;
  end loop;
end $$;
