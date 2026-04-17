import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client for server-only code. Bypasses RLS, so it must
// never be imported from anything that ships to the browser. Reads credentials
// from env vars populated at deploy time.

let cached = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
