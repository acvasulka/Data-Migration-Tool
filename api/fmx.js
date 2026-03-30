export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { siteUrl, email, password, endpoint, payload, method } = req.body;
  if (!siteUrl || !email || !password || !endpoint)
    return res.status(400).json({ error: 'Missing required fields' });
  const credentials = Buffer.from(`${email}:${password}`).toString('base64');
  const fmxUrl = `https://${siteUrl}/api${endpoint}`;
  const httpMethod = method || 'POST';
  try {
    const response = await fetch(fmxUrl, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: httpMethod !== 'GET' ? JSON.stringify(payload) : undefined,
    });
    let data;
    try { data = await response.json(); }
    catch { data = { status: response.status }; }
    // Forward FMX-* headers (e.g. FMX-Total-Count for pagination)
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
