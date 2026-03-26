import { useState, useEffect } from "react";
import { C } from "../theme";
import { getProjectStatus, getAllReferenceValues, saveProjectCredentials } from "../db";
import { encodeCredentials, testFmxConnection } from "../fmxSync";
import { IMPORT_ORDER } from "../schemas";

const NAVY = C.navy;
const ORANGE = C.orange;
const GREEN = '#1A7F4E';

const PULSE_STYLE = `
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.85); }
  }
`;

const DEPENDENCY_CHAINS = [
  { provider: 'Building',       consumers: ['Resource', 'User', 'Equipment', 'Inventory'] },
  { provider: 'Equipment Type', consumers: ['Equipment'] },
];

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

export default function ProjectChecklist({ history, projectId, refreshKey, selectedProject, onCredentialsSaved }) {
  const [dbStatus, setDbStatus] = useState({});
  const [activeTab, setActiveTab] = useState('progress');
  const [refValues, setRefValues] = useState([]);

  // Settings / credentials
  const [showCredForm, setShowCredForm] = useState(false);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credConnStatus, setCredConnStatus] = useState(null);
  const [credConnMsg, setCredConnMsg] = useState('');
  const [credConnLoading, setCredConnLoading] = useState(false);
  const [credSaving, setCredSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    getProjectStatus(projectId).then(s => setDbStatus(s || {}));
    getAllReferenceValues(projectId).then(v => setRefValues(v || []));
  }, [projectId, refreshKey]);

  // Build ref values map by schema type
  const refBySchema = {};
  for (const row of refValues) {
    if (!refBySchema[row.schema_type]) refBySchema[row.schema_type] = [];
    refBySchema[row.schema_type].push(row.value);
  }

  const sessionByType = {};
  (history || []).forEach(h => { sessionByType[h.type] = h; });

  const handleTestCred = async () => {
    if (!selectedProject?.fmx_site_url) return;
    setCredConnLoading(true);
    setCredConnStatus(null);
    const result = await testFmxConnection(selectedProject.fmx_site_url, credEmail, credPassword);
    setCredConnStatus(result.success ? 'ok' : 'fail');
    setCredConnMsg(result.message);
    setCredConnLoading(false);
  };

  const handleSaveCred = async () => {
    setCredSaving(true);
    const encoded = encodeCredentials(credEmail, credPassword);
    const verified = credConnStatus === 'ok';
    const updated = await saveProjectCredentials(selectedProject.id, encoded, verified);
    if (updated && onCredentialsSaved) onCredentialsSaved(updated);
    setShowCredForm(false);
    setCredEmail('');
    setCredPassword('');
    setCredConnStatus(null);
    setCredSaving(false);
  };

  const tabStyle = (tab) => ({
    flex: 1,
    padding: '8px 4px',
    fontSize: 11,
    fontWeight: activeTab === tab ? 700 : 400,
    color: activeTab === tab ? ORANGE : '#6B7280',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? `2px solid ${ORANGE}` : '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
  });

  const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: '1px solid #D1D5DB',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  // ── No project selected: just show session history ──────────────────────
  if (!projectId) {
    return (
      <div style={{ width: 280, flexShrink: 0 }}>
        <style>{PULSE_STYLE}</style>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Session History
            </p>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {(!history || history.length === 0)
              ? <p style={{ fontSize: 12, color: C.textLight, margin: 0 }}>No exports yet</p>
              : (history || []).map((h, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 500, color: NAVY }}>{h.type}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.textMid }}>{h.rows} rows · just now</p>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Project selected: tabbed panel ──────────────────────────────────────
  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      <style>{PULSE_STYLE}</style>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB' }}>
          <button style={tabStyle('progress')} onClick={() => setActiveTab('progress')}>Progress</button>
          <button style={tabStyle('dependencies')} onClick={() => setActiveTab('dependencies')}>Dependencies</button>
          <button style={tabStyle('settings')} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>

        {/* ── PROGRESS TAB ── */}
        {activeTab === 'progress' && (
          <div style={{ padding: '14px 16px' }}>
            {IMPORT_ORDER.map((schema, i) => {
              const db = dbStatus[schema];
              const session = sessionByType[schema];
              const done = db?.complete || !!session;
              const isCurrent = !done && IMPORT_ORDER.slice(0, i).every(s => dbStatus[s]?.complete || sessionByType[s]);

              return (
                <div key={schema} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  {done
                    ? <div style={{ width: 14, height: 14, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>
                      </div>
                    : isCurrent
                      ? <div style={{ width: 14, height: 14, borderRadius: '50%', background: ORANGE, flexShrink: 0, marginTop: 2, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                      : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #D1D5DB', flexShrink: 0, marginTop: 2 }} />
                  }
                  <div>
                    <span style={{ fontSize: 12, fontWeight: done ? 600 : isCurrent ? 600 : 400, color: done ? NAVY : isCurrent ? NAVY : C.textLight }}>
                      {schema}
                    </span>
                    {session && (
                      <div style={{ fontSize: 10, color: C.textMid }}>{session.rows} rows · just now</div>
                    )}
                    {!session && db?.complete && (
                      <div style={{ fontSize: 10, color: C.textMid }}>{db.rowCount} rows · {formatDate(db.completedAt)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DEPENDENCIES TAB ── */}
        {activeTab === 'dependencies' && (
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 12px', lineHeight: 1.4 }}>
              Reference values saved from completed imports.
            </p>
            {DEPENDENCY_CHAINS.map(({ provider, consumers }) => {
              const providerVals = refBySchema[provider] || [];
              const uniqueVals = [...new Set(providerVals)].sort();

              return (
                <div key={provider} style={{ marginBottom: 16 }}>
                  {/* Chain heading */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{provider}</span>
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>→</span>
                    <span style={{ fontSize: 10, color: '#6B7280' }}>{consumers.join(', ')}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 4 }}>
                    {uniqueVals.length === 0
                      ? <p style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', margin: '4px 0 0' }}>
                          No {provider} data saved yet.
                        </p>
                      : uniqueVals.map(val => (
                          <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #F9FAFB' }}>
                            <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#E6F4EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 8, color: GREEN, fontWeight: 700 }}>✓</span>
                            </div>
                            <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                          </div>
                        ))
                    }
                  </div>
                  {uniqueVals.length > 0 && (
                    <p style={{ fontSize: 10, color: '#9CA3AF', margin: '4px 0 0' }}>
                      {uniqueVals.length} value{uniqueVals.length !== 1 ? 's' : ''} · resolved at push
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div style={{ padding: '14px 16px' }}>
            {/* Project info */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Project</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: '0 0 2px' }}>{selectedProject?.name}</p>
              {selectedProject?.fmx_site_url && (
                <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{selectedProject.fmx_site_url}</p>
              )}
              {selectedProject?.fmx_connection_verified && (
                <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: '#E6F4EE', color: GREEN }}>
                  ✓ FMX Connected
                </span>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #F3F4F6', margin: '0 0 12px' }} />

            {/* API credentials */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>API Credentials</p>
              <button
                onClick={() => { setShowCredForm(v => !v); setCredConnStatus(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6B7280', padding: 0, textDecoration: 'underline' }}
              >
                {showCredForm ? 'Cancel' : (selectedProject?.fmx_credentials ? 'Update credentials' : 'Add credentials')}
              </button>

              {showCredForm && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>API email</label>
                    <input
                      style={inputStyle}
                      type="email"
                      placeholder="admin@example.com"
                      value={credEmail}
                      onChange={e => { setCredEmail(e.target.value); setCredConnStatus(null); }}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>API password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      placeholder="••••••••"
                      value={credPassword}
                      onChange={e => { setCredPassword(e.target.value); setCredConnStatus(null); }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <button
                      onClick={handleTestCred}
                      disabled={!credEmail || !credPassword || credConnLoading || !selectedProject?.fmx_site_url}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {credConnLoading ? 'Testing…' : 'Test'}
                    </button>
                    {credConnStatus && (
                      <span style={{ fontSize: 11, color: credConnStatus === 'ok' ? GREEN : '#DC2626', fontWeight: 500 }}>
                        {credConnMsg}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveCred}
                    disabled={!credEmail || !credPassword || credSaving}
                    style={{ width: '100%', fontSize: 12, padding: '6px 0', borderRadius: 5, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer', opacity: (!credEmail || !credPassword) ? 0.5 : 1, fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    {credSaving ? 'Saving…' : 'Save credentials'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
