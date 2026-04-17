import { useEffect, useState } from "react";
import { C } from "../theme";
import Modal from "./Modal";
import { getProjectPushes, getPush, markPushUndone } from "../db";
import { decodeCredentials } from "../fmxSync";
import { executePushUndo } from "../fmxUndo";
import { downloadCSV } from "../utils";

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

export default function PushHistoryView({ project }) {
  const [pushes, setPushes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoTarget, setUndoTarget] = useState(null); // push row being undone
  const [undoPhase, setUndoPhase] = useState('idle'); // 'idle' | 'need-password' | 'running' | 'done'
  const [undoProgress, setUndoProgress] = useState({ done: 0, total: 0 });
  const [undoResult, setUndoResult] = useState(null);
  const [password, setPassword] = useState('');

  const projectId = project?.id;

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const rows = await getProjectPushes(projectId);
    setPushes(rows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const startUndo = async (push) => {
    if (!project?.fmx_credentials) {
      alert('No saved FMX credentials on this project. Open Send to FMX first and save credentials, then retry.');
      return;
    }
    setUndoTarget(push);
    setUndoResult(null);
    setUndoPhase('need-password');
    setPassword('');
  };

  const runUndo = async () => {
    const push = undoTarget;
    if (!push) return;
    const saved = decodeCredentials(project.fmx_credentials);
    // Full push row with snapshots/ids (the listing query doesn't select them).
    const full = await getPush(push.id);
    if (!full) {
      alert('Could not load push record.');
      setUndoPhase('idle');
      return;
    }
    const creds = {
      siteUrl: full.fmx_site_url || project.fmx_site_url,
      email: saved.email,
      password: password || saved.password,
    };
    setUndoPhase('running');
    const total = full.mode === 'create'
      ? Object.keys(full.created_ids || {}).length
      : (full.update_snapshots || []).length;
    setUndoProgress({ done: 0, total });
    const result = await executePushUndo(full, creds, ({ done }) => {
      setUndoProgress({ done, total });
    });
    setUndoResult(result);
    await markPushUndone(push.id, result);
    setUndoPhase('done');
    await load();
  };

  const closeUndoModal = () => {
    setUndoTarget(null);
    setUndoPhase('idle');
    setUndoResult(null);
    setPassword('');
  };

  return (
    <div style={{ padding: '14px 24px' }}>
      <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>
        Every Create or Update push to FMX is recorded here. Click Undo to reverse a push — creates are deleted, updates are restored from their pre-push snapshot.
      </p>

      {loading && <p style={{ fontSize: 12, color: C.textLight }}>Loading\u2026</p>}

      {!loading && pushes.length === 0 && (
        <p style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic' }}>No pushes recorded yet.</p>
      )}

      {!loading && pushes.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.6fr 0.6fr 0.9fr 0.9fr', background: C.bgPage, padding: '8px 10px', fontSize: 11, fontWeight: 600, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div>Date</div>
            <div>Schema</div>
            <div>Mode</div>
            <div>Pushed</div>
            <div>Failed</div>
            <div>Status</div>
            <div />
          </div>
          {pushes.map(p => {
            const status = p.undone_at ? 'Undone' : 'Active';
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.6fr 0.6fr 0.9fr 0.9fr', alignItems: 'center', padding: '8px 10px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textDark }}>
                <div>{formatDate(p.pushed_at)}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.schema_type}</div>
                <div style={{ textTransform: 'capitalize' }}>{p.mode}</div>
                <div>{p.succeeded}</div>
                <div style={{ color: p.failed > 0 ? '#DC2626' : C.textMid }}>{p.failed}</div>
                <div style={{ color: p.undone_at ? C.textLight : '#1A7F4E', fontWeight: 500 }}>{status}</div>
                <div>
                  {!p.undone_at && (
                    <button
                      onClick={() => startUndo(p)}
                      style={{ background: C.white, color: '#DC2626', border: '1px solid #DC2626', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {undoTarget && (
        <Modal width={420} onClose={undoPhase === 'running' ? undefined : closeUndoModal}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: C.navy }}>
            Undo {undoTarget.mode} push
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.textMid }}>
            {undoTarget.schema_type} \u2014 {undoTarget.succeeded} record{undoTarget.succeeded !== 1 ? 's' : ''} pushed on {formatDate(undoTarget.pushed_at)}
          </p>

          {undoPhase === 'need-password' && (
            <>
              <p style={{ fontSize: 12, color: C.textMid, margin: '0 0 8px' }}>
                Re-enter your FMX password to confirm. This will {undoTarget.mode === 'create' ? 'delete' : 'restore'} {undoTarget.succeeded} record{undoTarget.succeeded !== 1 ? 's' : ''} in FMX.
              </p>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="FMX password (leave blank to use saved)"
                className="fmx-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closeUndoModal} className="fmx-btn-secondary" style={{ flex: 1, fontSize: 12, padding: '8px 0' }}>Cancel</button>
                <button onClick={runUndo} style={{ flex: 1, fontSize: 12, padding: '8px 0', background: '#DC2626', color: C.white, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                  Run undo
                </button>
              </div>
            </>
          )}

          {undoPhase === 'running' && (
            <>
              <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 10px' }}>Reversing {undoProgress.total} record{undoProgress.total !== 1 ? 's' : ''}\u2026</p>
              <div style={{ height: 8, background: C.bgPage, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  height: '100%',
                  width: `${undoProgress.total ? Math.round((undoProgress.done / undoProgress.total) * 100) : 0}%`,
                  background: '#DC2626', borderRadius: 4, transition: 'width 0.2s ease',
                }} />
              </div>
              <p style={{ fontSize: 11, color: C.textLight, margin: 0 }}>
                {undoProgress.done} / {undoProgress.total}
              </p>
            </>
          )}

          {undoPhase === 'done' && undoResult && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#E6F7EF', borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1A7F4E' }}>{undoResult.reversed}</div>
                  <div style={{ fontSize: 11, color: '#1A7F4E', fontWeight: 500, marginTop: 2 }}>Reversed</div>
                </div>
                <div style={{ flex: 1, background: undoResult.failed > 0 ? '#FEE2E2' : C.bgPage, borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: undoResult.failed > 0 ? '#DC2626' : C.textLight }}>{undoResult.failed}</div>
                  <div style={{ fontSize: 11, color: undoResult.failed > 0 ? '#DC2626' : C.textLight, fontWeight: 500, marginTop: 2 }}>Failed</div>
                </div>
              </div>
              {undoResult.failures.length > 0 && (
                <button
                  onClick={() => downloadCSV(
                    `${undoTarget.schema_type.replace(/\s+/g, '_')}_undo_failures.csv`,
                    ['id', 'error'],
                    undoResult.failures,
                  )}
                  style={{ display: 'block', fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 12, padding: 0 }}
                >
                  Download {undoResult.failures.length} failed item{undoResult.failures.length !== 1 ? 's' : ''} as CSV
                </button>
              )}
              <button onClick={closeUndoModal} className="fmx-btn-primary" style={{ width: '100%', fontSize: 13, padding: '10px 0' }}>Close</button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
