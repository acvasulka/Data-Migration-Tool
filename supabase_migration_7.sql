-- Migration 7: Admin bootstrap trigger, new-user profile trigger, admin-update RLS, FK cascade
-- Run in Supabase SQL editor after migration 6

-- ─────────────────────────────────────────────────────────────────────
-- 1. FK cascade: when a user is deleted, null out their owned projects
--    (so projects become "unassigned" instead of failing the FK constraint)
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'projects'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '%REFERENCES auth.users%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', fk_name);
  END IF;
END
$$;

ALTER TABLE projects
  ADD CONSTRAINT projects_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Auto-promote first user to admin when no admin exists yet
--    Fires BEFORE INSERT on profiles so it can modify NEW.role
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION promote_first_user_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_promote_first_admin ON profiles;
CREATE TRIGGER trg_promote_first_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION promote_first_user_to_admin();

-- ─────────────────────────────────────────────────────────────────────
-- 3. Create a profile row automatically when a new auth user is created
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    'user'  -- promoted to 'admin' by the BEFORE INSERT trigger above if no admin exists yet
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Allow admins to update any profile (for role changes)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_can_update_any_profile" ON profiles;
CREATE POLICY "admins_can_update_any_profile" ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
