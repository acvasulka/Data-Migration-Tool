export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export async function fmxFetch({ siteUrl, email, password, endpoint, method, payload }) {
  const res = await fetch('/api/fmx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl, email, password, endpoint, method, payload }),
  });
  return res;
}

export async function claudeFetch({ messages, max_tokens, system }) {
  const body = { model: CLAUDE_MODEL, max_tokens, messages };
  if (system) body.system = system;
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function parseClaudeText(data) {
  return (data.content?.[0]?.text || "").replace(/```json|```javascript|```js|```/g, "").trim();
}
