// Edge Function: delete-user
// Deletes a user from auth.users (and their profile cascades via FK).
// Only admins can invoke this — we verify by checking the caller's profile.
//
// Deployment:
//   supabase functions deploy delete-user
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
//
// Invocation from the client:
//   supabase.functions.invoke('delete-user', { body: { userId: '<uuid>' } })

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

    // 1. Parse body
    const { userId } = await req.json();
    if (!userId || typeof userId !== 'string') {
      return json({ error: 'Missing userId' }, 400);
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
    const { data: profile, error: profileError } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403);
    }

    // 4. Prevent self-deletion
    if (caller.id === userId) {
      return json({ error: 'You cannot delete your own account' }, 400);
    }

    // 5. Delete via service-role client
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: `Delete failed: ${deleteError.message}` }, 500);
    }

    // 6. Delete the profile row (in case FK cascade is not set)
    await adminClient.from('profiles').delete().eq('id', userId);

    return json({ success: true }, 200);
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
