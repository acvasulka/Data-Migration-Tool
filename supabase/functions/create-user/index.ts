// Edge Function: create-user
// Creates a new auth user with a temporary password and writes the profile row
// (id, full_name, email, role). Only admins can invoke — we verify by checking
// the caller's profile.
//
// Deployment:
//   supabase functions deploy create-user
//   (reuses the existing SUPABASE_SERVICE_ROLE_KEY secret)
//
// Invocation from the client:
//   supabase.functions.invoke('create-user', { body: { email, fullName, role, password } })

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Parse + validate body
    const { email, fullName, role, password } = await req.json();

    const emailOk = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) return json({ error: 'Invalid email' }, 400);

    if (typeof fullName !== 'string' || fullName.trim().length === 0) {
      return json({ error: 'Full name is required' }, 400);
    }

    if (role !== 'user' && role !== 'admin') {
      return json({ error: 'Role must be "user" or "admin"' }, 400);
    }

    if (typeof password !== 'string' || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // 2. Verify caller's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: 'Invalid token' }, 401);

    // 3. Verify caller is an admin
    const { data: callerProfile, error: profileError } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403);
    }

    // 4. Create the auth user via service-role client
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: trimmedName, email: normalizedEmail },
    });

    if (createError || !created?.user) {
      const msg = createError?.message || 'Failed to create user';
      const status = /already.*registered|already exists|duplicate/i.test(msg) ? 409 : 500;
      return json({ error: msg }, status);
    }

    const newUserId = created.user.id;

    // 5. Upsert the profile row to guarantee the chosen role is set
    //    (a handle_new_user trigger may have already inserted a default row).
    const { error: upsertError } = await adminClient
      .from('profiles')
      .upsert(
        { id: newUserId, full_name: trimmedName, email: normalizedEmail, role },
        { onConflict: 'id' },
      );

    if (upsertError) {
      // Roll back the auth user so the admin can retry cleanly.
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: `Profile write failed: ${upsertError.message}` }, 500);
    }

    return json({ success: true, userId: newUserId }, 200);
  } catch (err) {
    return json({ error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
