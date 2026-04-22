import { decodeEmailPassword } from './_lib/crypto.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// FMX proxy. Three accepted call shapes:
//   1. { projectId, endpoint, method, payload }                 ← JSON API call via saved creds
//   2. { siteUrl, email, password, endpoint, method, payload }  ← verify-before-save flow (JSON)
//   3. { projectId, mode: 'binary', attachmentDownloadUrl }     ← fetch an attachment as base64
// Browsers using saved credentials should always use shape (1) or (3) so plaintext
// never traverses the browser->server boundary after the initial save.
//
// Binary mode is scoped to URLs that live under the project's configured
// fmx_site_url — we don't let the client proxy arbitrary URLs with the
// project's stored credentials.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { projectId, mode, attachmentDownloadUrl, endpoint, payload, method } = req.body || {};

  if (mode === 'binary') {
    return handleBinary(req, res, { projectId, attachmentDownloadUrl });
  }

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

// Fetch an attachment by its FMX downloadUrl (from /v1/attachments/{id}) and
// return it base64-encoded so the browser can hand it to Claude vision.
async function handleBinary(req, res, { projectId, attachmentDownloadUrl }) {
  if (!projectId) return res.status(400).json({ error: 'Binary mode requires projectId' });
  if (!attachmentDownloadUrl) return res.status(400).json({ error: 'Missing attachmentDownloadUrl' });

  let siteUrl, email, password;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .select('fmx_site_url, fmx_credentials')
      .eq('id', projectId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Project not found' });
    if (!data.fmx_credentials) return res.status(400).json({ error: 'No stored credentials for project' });
    siteUrl = data.fmx_site_url;
    const creds = decodeEmailPassword(data.fmx_credentials);
    email = creds.email;
    password = creds.password;
  } catch (e) {
    return res.status(500).json({ error: `Credential lookup failed: ${e.message}` });
  }

  // Only proxy downloads that point at this project's FMX site. Prevents the
  // client from using our saved creds to fetch arbitrary external URLs.
  let parsed;
  try { parsed = new URL(attachmentDownloadUrl); }
  catch { return res.status(400).json({ error: 'Invalid attachmentDownloadUrl' }); }
  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only https downloads are allowed' });
  }
  if (parsed.hostname.toLowerCase() !== String(siteUrl || '').toLowerCase()) {
    return res.status(400).json({ error: 'Download host does not match project fmx_site_url' });
  }

  try {
    const basic = Buffer.from(`${email}:${password}`).toString('base64');
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Basic ${basic}` },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Attachment download failed: ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const cd = response.headers.get('content-disposition') || '';
    const filenameMatch = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i.exec(cd);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : null;

    const buf = Buffer.from(await response.arrayBuffer());
    // Cap at ~20 MB to avoid serverless memory blowups; Claude won't take bigger anyway.
    if (buf.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'Attachment exceeds 20MB limit' });
    }
    res.status(200).json({
      base64: buf.toString('base64'),
      contentType: contentType.split(';')[0].trim(),
      filename,
      byteCount: buf.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
