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
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      res.status === 529
        ? "Claude is temporarily overloaded — please try again in a moment."
        : res.status === 429
          ? "Rate limit reached — please wait a moment and try again."
          : data.error?.message || "AI request failed."
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function parseClaudeText(data) {
  return (data.content?.[0]?.text || "").replace(/```json|```javascript|```js|```/g, "").trim();
}
