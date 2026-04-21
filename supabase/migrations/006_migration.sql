-- Migration 6: Add project ownership, user roles, and profile email
-- Run in Supabase SQL editor

-- 1. Add user_id (owner) to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Add role column to profiles (default 'user', admins set manually via dashboard)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- 3. Add email column to profiles for lookups
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- 4. Allow all authenticated users to read all profiles (needed for owner display + role checks)
-- Drop the restrictive policy first if it exists, then create a permissive SELECT policy
DO $$
BEGIN
  -- Try to drop old restrictive policy (ignore if it doesn't exist)
  BEGIN
    DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END
$$;

CREATE POLICY "profiles_select_all_authenticated" ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. Backfill email from auth.users into profiles where missing
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');
