import { encodeEmailPassword } from './_lib/crypto.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// POST   { projectId, siteUrl, email, password, verified }  → encrypt + store
// DELETE { projectId }                                      → clear stored creds
// Accepting plaintext password in the request body is the ONE place that does so.
// Every other call path references credentials by projectId only.

export default async function handler(req, res) {
  if (req.method === 'DELETE') return handleDelete(req, res);
  if (req.method !== 'POST') return res.status(405).end();

  const { projectId, siteUrl, email, password, verified } = req.body || {};
  if (!projectId || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let encrypted;
  try {
    encrypted = encodeEmailPassword(email, password);
  } catch (e) {
    return res.status(500).json({ error: `Encryption failed: ${e.message}` });
  }

  const supabase = getSupabaseAdmin();
  const updates = {
    fmx_credentials: encrypted,
    fmx_api_email: email,          // plaintext email for display (not the password)
    fmx_connection_verified: !!verified,
  };
  if (siteUrl) updates.fmx_site_url = siteUrl;

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ project: data });
}

async function handleDelete(req, res) {
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('projects')
    .update({ fmx_credentials: null, fmx_api_email: null, fmx_connection_verified: false })
    .eq('id', projectId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ project: data });
}
