const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function callWithRetry(body) {
  let lastResponse;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (lastResponse.status !== 429 && lastResponse.status !== 529) return lastResponse;
    if (attempt === MAX_RETRIES) return lastResponse;
    const retryAfter = lastResponse.headers.get('retry-after');
    const delay = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 8000)
      : BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise(r => setTimeout(r, delay));
  }
  return lastResponse;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const response = await callWithRetry(req.body);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Claude API' } });
  }
}
