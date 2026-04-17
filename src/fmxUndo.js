import { fmxFetch } from './apiClient';

// Runs the reverse of a push. Shared by FMXPushModal's undo phase and PushHistoryView.
//
// Params:
//   push:  { mode, endpoint_base, created_ids, update_snapshots }  (shape from project_pushes row,
//          or the in-memory equivalent built during a just-completed push).
//   creds: { siteUrl, email, password }
//   onProgress?: ({ done, total, last: { ok, label } }) => void
//
// Returns: { reversed, failed, failures: [{ id, error }] }
export async function executePushUndo(push, creds, onProgress) {
  const failures = [];
  let reversed = 0;
  const { mode, endpoint_base: base } = push;

  const items = mode === 'create'
    ? Object.entries(push.created_ids || {}).map(([, id]) => ({ id, snapshot: null }))
    : Array.isArray(push.update_snapshots)
      ? push.update_snapshots.map(s => ({ id: s.id, snapshot: s.body }))
      : [];

  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const { id, snapshot } = items[i];
    let ok = false;
    let errMsg = '';
    try {
      const res = mode === 'create'
        ? await fmxFetch({ ...creds, endpoint: `${base}/${id}`, method: 'DELETE' })
        : await fmxFetch({ ...creds, endpoint: `${base}/${id}`, method: 'PUT', payload: snapshot });
      ok = res.ok || res.status === 200 || res.status === 201 || res.status === 204;
      if (!ok) {
        try {
          const body = res.status === 204 ? null : await res.json();
          errMsg = body?.message || body?.error
            || (body?.errors ? JSON.stringify(body.errors) : '')
            || `HTTP ${res.status}`;
        } catch { errMsg = `HTTP ${res.status}`; }
      }
    } catch (e) {
      errMsg = e.message || 'Network error';
    }

    if (ok) reversed++;
    else failures.push({ id, error: errMsg });

    if (onProgress) onProgress({ done: i + 1, total, last: { ok, label: String(id) } });
  }

  return { reversed, failed: failures.length, failures };
}
