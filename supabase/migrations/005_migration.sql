-- Migration 5: Add card_settings column for per-card visibility and completion state
-- Apply in Supabase SQL editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS card_settings jsonb DEFAULT '{}';
