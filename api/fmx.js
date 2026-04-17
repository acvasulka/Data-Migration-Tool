import { decodeEmailPassword } from './_lib/crypto.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// FMX proxy. Two accepted call shapes:
//   1. { projectId, endpoint, method, payload }       ← preferred; looks up + decrypts creds
//   2. { siteUrl, email, password, endpoint, method, payload } ← only for verify-before-save flows
// Browsers using saved credentials should always use shape (1) so plaintext never
// traverses the browser->server boundary after the initial save.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { projectId, endpoint, payload, method } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  let siteUrl = req.body?.siteUrl;
  let email = req.body?.email;
  let password = req.body?.password;

  if (projectId) {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('projects')
        .select('fmx_site_url, fmx_credentials')
        .eq('id', projectId)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Project not found' });
      if (!data.fmx_credentials) return res.status(400).json({ error: 'No stored credentials for project' });
      siteUrl = siteUrl || data.fmx_site_url;
      const creds = decodeEmailPassword(data.fmx_credentials);
      email = creds.email;
      password = creds.password;
    } catch (e) {
      return res.status(500).json({ error: `Credential lookup failed: ${e.message}` });
    }
  }

  if (!siteUrl || !email || !password) {
    return res.status(400).json({ error: 'Missing credentials or siteUrl' });
  }

  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const fmxUrl = `https://${siteUrl}/api${endpoint}`;
  const httpMethod = method || 'POST';

  try {
    const headers = { 'Authorization': `Basic ${basic}` };
    const hasBody = httpMethod !== 'GET' && httpMethod !== 'DELETE';
    if (hasBody) headers['Content-Type'] = 'application/json';

    const response = await fetch(fmxUrl, {
      method: httpMethod,
      headers,
      body: hasBody ? JSON.stringify(payload) : undefined,
    });
    let data;
    if (response.status === 204) {
      data = { status: 204 };
    } else {
      try { data = await response.json(); }
      catch { data = { status: response.status }; }
    }
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().startsWith('fmx-')) {
        res.setHeader(key, value);
      }
    }
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
