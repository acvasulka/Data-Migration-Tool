-- Migration 4: Add fmx_modules column to store org-specific module URL slugs
-- Apply in Supabase SQL editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS fmx_modules jsonb;
