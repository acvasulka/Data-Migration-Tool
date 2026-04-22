export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// fmxFetch proxies requests through /api/fmx. Two accepted shapes:
//   1. { projectId, endpoint, ... }                         ← preferred for saved creds
//   2. { siteUrl, email, password, endpoint, ... }          ← only verify-before-save flows
// Plaintext credentials should only appear in shape (2), and only during
// the initial credential setup, to keep passwords off the wire thereafter.
export async function fmxFetch(opts) {
  const { projectId, siteUrl, email, password, endpoint, method, payload } = opts || {};
  const body = projectId
    ? { projectId, endpoint, method, payload }
    : { siteUrl, email, password, endpoint, method, payload };
  const res = await fetch('/api/fmx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

// Download an FMX attachment by its `downloadUrl` (returned from
// /v1/attachments/{id}) via the binary mode of /api/fmx. The server injects
// the project's saved Basic-auth credentials, fetches the bytes, and returns
// them base64-encoded so the browser can hand the data to Claude vision
// without the password or raw URL ever touching the browser.
export async function fmxAttachmentDownload({ projectId, downloadUrl }) {
  const res = await fetch('/api/fmx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, mode: 'binary', attachmentDownloadUrl: downloadUrl }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Attachment download failed: ${res.status}`);
  }
  return data; // { base64, contentType, filename, byteCount }
}

// Save/encrypt FMX credentials server-side. Plaintext password crosses the
// browser/server boundary exactly once (here); thereafter the client refers
// to them only by projectId.
export async function saveFmxCredentialsRequest({ projectId, siteUrl, email, password, verified }) {
  const res = await fetch('/api/fmx-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, siteUrl, email, password, verified }),
  });
  if (!res.ok) {
    let msg = 'Failed to save credentials';
    try { const d = await res.json(); if (d?.error) msg = d.error; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.project;
}

export async function clearFmxCredentialsRequest(projectId) {
  const res = await fetch('/api/fmx-credentials', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error('Failed to clear credentials');
  const data = await res.json();
  return data.project;
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
