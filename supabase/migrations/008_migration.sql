-- Migration 8: Fix "Database error saving new user" on signup
--
-- Root cause: handle_new_user() from migration 7 was running with an empty
-- search_path inside the auth.users trigger context, so `INSERT INTO profiles`
-- could not resolve the table. Combined with the legacy FOR ALL RLS policy
-- on profiles (auth.uid() = id), the trigger failed inside the signup
-- transaction, which Supabase wraps as "Database error saving new user".
--
-- This migration:
--   1. Recreates the two SECURITY DEFINER functions with SET search_path = public
--      and fully-qualified table names (public.profiles).
--   2. Adds an EXCEPTION WHEN OTHERS handler so that any future bug in profile
--      creation logs a WARNING instead of blocking signup.
--   3. Replaces the legacy "FOR ALL using (auth.uid() = id)" policy on profiles
--      with split per-operation policies that allow trigger-based INSERT while
--      keeping SELECT/UPDATE/DELETE sensibly restricted.
--   4. Grants the supabase_auth_admin role the minimum privileges it needs.
--
-- Run after migrations 6 and 7. Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Recreate handle_new_user() with explicit search_path + exception safety
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'user'  -- upgraded to 'admin' by the BEFORE INSERT trigger on profiles if no admin exists
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup. Log and let auth.users commit so the user can retry
  -- or have a profile row created lazily later.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────
-- 2. Recreate promote_first_user_to_admin() with explicit search_path
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.promote_first_user_to_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_first_admin ON public.profiles;
CREATE TRIGGER trg_promote_first_admin
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_first_user_to_admin();

-- ─────────────────────────────────────────────────────────────────────
-- 3. Replace the legacy "FOR ALL" profiles policy with per-operation policies
-- ─────────────────────────────────────────────────────────────────────

-- The original migration created:
--   create policy "authenticated users can access profiles"
--     on profiles for all using (auth.uid() = id);
-- FOR ALL implicitly applies the USING clause as WITH CHECK for INSERT,
-- which blocks trigger-based inserts when auth.uid() is NULL.
DROP POLICY IF EXISTS "authenticated users can access profiles" ON public.profiles;

-- SELECT: any authenticated user can read all profiles (needed for owner display
-- and admin panel). Migration 6 already added this policy; recreate defensively.
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_all_authenticated" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- UPDATE: users can update their own profile; admins can update any.
DROP POLICY IF EXISTS "admins_can_update_any_profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- INSERT: permissive. Trigger-based inserts run when auth.uid() may be NULL,
-- and the FK to auth.users(id) guarantees ids are real users. See plan's
-- "Open risks" section for rationale.
DROP POLICY IF EXISTS "profiles_insert_from_trigger" ON public.profiles;
CREATE POLICY "profiles_insert_from_trigger" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- DELETE: admin only. Deleting an auth user cascades to profiles via its own
-- FK path, so this is only relevant for manual admin cleanup.
DROP POLICY IF EXISTS "profiles_delete_admin_only" ON public.profiles;
CREATE POLICY "profiles_delete_admin_only" ON public.profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. Grant privileges to supabase_auth_admin (belt-and-suspenders)
-- ─────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, SELECT ON public.profiles TO supabase_auth_admin;
