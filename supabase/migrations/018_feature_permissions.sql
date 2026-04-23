-- Migration 018: Per-user feature permissions.
--
-- Adds a JSONB column on `profiles` so admins can grant access to specific
-- optional tools on a per-user basis. Shape: { "<feature_key>": true }.
-- First consumer: the Equipment Attachment OCR tool ("equipment_ocr").
--
-- Admins bypass feature flags and always see every tool — the flag only
-- gates non-admin users. Read access to own row is already granted by the
-- existing profiles RLS policies; writes are admin-only via the policy below.
--
-- Additive & idempotent; safe to re-run.

alter table profiles
  add column if not exists feature_permissions jsonb not null default '{}'::jsonb;

-- Admins can update any profile's feature_permissions. The existing
-- profiles policies handle self-read; this adds an admin-write path scoped
-- to the new column via a dedicated policy.
drop policy if exists "admins can update feature_permissions" on profiles;
create policy "admins can update feature_permissions"
  on profiles for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
