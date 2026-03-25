import { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, getProjectStatus, updateProject, saveProjectCredentials } from '../db';
import { encodeCredentials, testFmxConnection } from '../fmxSync';
import { IMPORT_ORDER } from '../schemas';

const NAVY = '#041662';
const ORANGE = '#CF4A12';

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function StatusBadge({ completedCount }) {
  if (completedCount === 6)
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: '#1A7F4E' }}>Complete</span>;
  if (completedCount > 0)
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#FFF3CD', color: '#856404' }}>In progress</span>;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#6B7280' }}>Not started</span>;
}

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '0.5px solid #E0E0E0', padding: '16px 20px', marginBottom: 10 }}>
      <div style={{ height: 14, background: '#E5E7EB', borderRadius: 4, width: '60%', marginBottom: 10, animation: 'shimmer 1.4s infinite' }} />
      <div style={{ height: 10, background: '#F3F4F6', borderRadius: 4, width: '40%', marginBottom: 12 }} />
      <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, width: '100%' }} />
    </div>
  );
}

function DocumentPlusIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="26" height="34" rx="3" stroke={NAVY} strokeWidth="2.5" fill="none" />
      <path d="M28 4v10h10" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 34h8M34 30v8" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 18h14M14 24h8" stroke={NAVY} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export default function ProjectScreen({ onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'create'
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState('');

  // create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fmxSiteUrl, setFmxSiteUrl] = useState('');
  const [fmxApiEmail, setFmxApiEmail] = useState('');
  const [fmxApiPassword, setFmxApiPassword] = useState('');
  const [apiExpanded, setApiExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createConnStatus, setCreateConnStatus] = useState(null); // null | 'ok' | 'fail'
  const [createConnMsg, setCreateConnMsg] = useState('');
  const [createConnLoading, setCreateConnLoading] = useState(false);
  const [createConnVerified, setCreateConnVerified] = useState(false);

  // update credentials panel (for selected project detail)
  const [showUpdateCreds, setShowUpdateCreds] = useState(false);
  const [updateEmail, setUpdateEmail] = useState('');
  const [updatePassword, setUpdatePassword] = useState('');
  const [updateConnStatus, setUpdateConnStatus] = useState(null);
  const [updateConnMsg, setUpdateConnMsg] = useState('');
  const [updateConnLoading, setUpdateConnLoading] = useState(false);
  const [updateSaving, setUpdateSaving] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    const data = await getProjects();
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => { loadProjects(); }, []);

  const loadStatus = async (projectId) => {
    setStatusLoading(true);
    const s = await getProjectStatus(projectId);
    setStatus(s);
    setStatusLoading(false);
  };

  const handleSelectProject = (p) => {
    setSelected(p);
    setMode('idle');
    setDeleteConfirm(false);
    setEditingName(false);
    loadStatus(p.id);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    const encoded = fmxApiEmail && fmxApiPassword ? encodeCredentials(fmxApiEmail, fmxApiPassword) : null;
    const p = await createProject(name, description, fmxSiteUrl, encoded, createConnVerified);
    if (!p) { setCreateError('Unable to create project. Please try again.'); setCreating(false); return; }
    await loadProjects();
    setMode('idle');
    setName(''); setDescription(''); setFmxSiteUrl(''); setFmxApiEmail(''); setFmxApiPassword('');
    setCreateConnStatus(null); setCreateConnVerified(false);
    handleSelectProject(p);
    setCreating(false);
  };

  const handleTestCreateConn = async () => {
    setCreateConnLoading(true); setCreateConnStatus(null);
    const result = await testFmxConnection(fmxSiteUrl, fmxApiEmail, fmxApiPassword);
    setCreateConnStatus(result.success ? 'ok' : 'fail');
    setCreateConnMsg(result.message);
    setCreateConnVerified(result.success);
    setCreateConnLoading(false);
  };

  const handleTestUpdateConn = async () => {
    setUpdateConnLoading(true); setUpdateConnStatus(null);
    const result = await testFmxConnection(selected.fmx_site_url, updateEmail, updatePassword);
    setUpdateConnStatus(result.success ? 'ok' : 'fail');
    setUpdateConnMsg(result.message);
    setUpdateConnLoading(false);
  };

  const handleSaveUpdateCreds = async () => {
    setUpdateSaving(true);
    const encoded = encodeCredentials(updateEmail, updatePassword);
    const verified = updateConnStatus === 'ok';
    console.log('Saving credentials for project:', selected.id, 'encoded:', !!encoded, 'verified:', verified);
    const updated = await saveProjectCredentials(selected.id, encoded, verified);
    if (updated) {
      setSelected(updated);
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      setShowUpdateCreds(false);
      setUpdateEmail(''); setUpdatePassword(''); setUpdateConnStatus(null);
    }
    setUpdateSaving(false);
  };

  const handleDelete = async () => {
    await deleteProject(selected.id);
    setSelected(null);
    setStatus({});
    setDeleteConfirm(false);
    await loadProjects();
  };

  const handleNameBlur = async () => {
    if (editNameVal.trim() && editNameVal !== selected.name) {
      const updated = await updateProject(selected.id, { name: editNameVal.trim() });
      if (updated) {
        setSelected(updated);
        setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      }
    }
    setEditingName(false);
  };

  const completedCount = (proj) =>
    IMPORT_ORDER.filter(s => status[s]?.complete).length;

  const cardStyle = (p) => ({
    background: selected?.id === p.id ? '#FFF8F6' : '#fff',
    borderRadius: 8,
    border: '0.5px solid #E0E0E0',
    borderLeft: selected?.id === p.id ? `3px solid ${ORANGE}` : '0.5px solid #E0E0E0',
    padding: '16px 20px',
    marginBottom: 10,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6,
    border: '1px solid #D1D5DB', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const cnt = selected ? IMPORT_ORDER.filter(s => status[s]?.complete).length : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .proj-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
      `}</style>

      {/* Header */}
      <div style={{ height: 52, background: NAVY, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem', display: 'grid', gridTemplateColumns: '60% 40%', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Project list */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: NAVY }}>Your projects</span>
            <button
              onClick={() => { setMode('create'); setSelected(null); setDeleteConfirm(false); }}
              style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              + New project
            </button>
          </div>

          {loading && [0, 1, 2].map(i => <SkeletonCard key={i} />)}

          {!loading && projects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <DocumentPlusIcon />
              <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginTop: 16, marginBottom: 6 }}>No projects yet</p>
              <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>Create your first migration project to get started</p>
              <button
                onClick={() => setMode('create')}
                style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
              >
                + Create project
              </button>
            </div>
          )}

          {!loading && projects.map(p => {
            const isSelected = selected?.id === p.id;
            const pct = isSelected ? (cnt / 6) * 100 : 0;
            return (
              <div
                key={p.id}
                className="proj-card"
                style={cardStyle(p)}
                onClick={() => handleSelectProject(p)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: NAVY }}>{p.name}</span>
                  {isSelected
                    ? <StatusBadge completedCount={cnt} />
                    : <StatusBadge completedCount={0} />
                  }
                </div>
                {p.fmx_site_url && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280' }}>{p.fmx_site_url}</p>
                )}
                <div style={{ height: 6, background: '#E0E0E0', borderRadius: 3, margin: '8px 0 4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: ORANGE, borderRadius: 3, width: `${isSelected ? pct : 0}%`, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{isSelected ? `${cnt} of 6 schemas complete` : '— of 6 schemas complete'}</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{daysSince(p.updated_at) || ''}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT — Detail panel */}
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', minHeight: 400, padding: '24px 24px' }}>

          {/* STATE A */}
          {mode === 'idle' && !selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360, color: '#9CA3AF', fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: '0 2rem' }}>
              Select a project to view details, or create a new one
            </div>
          )}

          {/* STATE B — Create form */}
          {mode === 'create' && (
            <form onSubmit={handleCreate}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>New project</h2>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Project name *</label>
                <input style={inputStyle} required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside School District" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  rows={3} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Optional notes about this migration"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 2 }}>FMX site URL</label>
                <span style={{ fontSize: 11, color: '#9CA3AF', display: 'block', marginBottom: 4 }}>Used for direct API push later</span>
                <input style={inputStyle} value={fmxSiteUrl} onChange={e => setFmxSiteUrl(e.target.value)} placeholder="yoursite.gofmx.com" />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #F3F4F6', margin: '16px 0' }} />

              {/* API credentials — collapsed */}
              <button
                type="button"
                onClick={() => setApiExpanded(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#374151', padding: 0, marginBottom: 12 }}
              >
                <span style={{ display: 'inline-block', transform: apiExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 11 }}>▶</span>
                API credentials (optional)
              </button>
              {apiExpanded && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>FMX API email</label>
                    <input style={inputStyle} type="email" placeholder="admin@example.com" value={fmxApiEmail} onChange={e => { setFmxApiEmail(e.target.value); setCreateConnStatus(null); setCreateConnVerified(false); }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>FMX API password</label>
                    <input style={inputStyle} type="password" placeholder="••••••••" value={fmxApiPassword} onChange={e => { setFmxApiPassword(e.target.value); setCreateConnStatus(null); setCreateConnVerified(false); }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <button
                      type="button"
                      onClick={handleTestCreateConn}
                      disabled={!fmxSiteUrl || !fmxApiEmail || !fmxApiPassword || createConnLoading}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #D1D5DB', background: '#fff', whiteSpace: 'nowrap' }}
                    >
                      {createConnLoading ? 'Testing…' : 'Test connection'}
                    </button>
                    {createConnStatus && (
                      <span style={{ fontSize: 12, color: createConnStatus === 'ok' ? '#1A7F4E' : '#DC2626', fontWeight: 500 }}>
                        {createConnMsg}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Credentials are stored encoded and used for direct FMX push</p>
                </div>
              )}

              {createError && <p style={{ color: '#DC2626', fontSize: 13, margin: '8px 0' }}>{createError}</p>}
              <button
                type="submit" disabled={creating}
                style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 500, background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1, marginTop: 4 }}
              >
                {creating ? 'Creating…' : 'Create project'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 10 }}>
                <button type="button" onClick={() => setMode('idle')} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </p>
            </form>
          )}

          {/* STATE C — Project detail */}
          {mode === 'idle' && selected && (
            <div>
              {/* Name heading */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {editingName
                  ? <input
                      autoFocus
                      value={editNameVal}
                      onChange={e => setEditNameVal(e.target.value)}
                      onBlur={handleNameBlur}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      style={{ fontSize: 17, fontWeight: 700, color: NAVY, border: 'none', borderBottom: `2px solid ${ORANGE}`, outline: 'none', flex: 1, background: 'transparent' }}
                    />
                  : <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{selected.name}</span>
                }
                <button
                  onClick={() => { setEditingName(true); setEditNameVal(selected.name); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: '2px 4px' }}
                  title="Edit name"
                >✏️</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                {selected.fmx_site_url && (
                  <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>{selected.fmx_site_url}</p>
                )}
                {selected.fmx_connection_verified && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: '#1A7F4E', whiteSpace: 'nowrap' }}>
                    ✓ FMX Connected
                  </span>
                )}
              </div>

              {/* Import checklist */}
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Import checklist · {statusLoading ? '…' : `${cnt} of 6 complete`}
              </p>
              <div style={{ marginBottom: 20 }}>
                {IMPORT_ORDER.map((schema, i) => {
                  const s = status[schema];
                  const done = s?.complete;
                  const isCurrent = !done && IMPORT_ORDER.slice(0, i).every(prev => status[prev]?.complete);
                  return (
                    <div key={schema} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                      {/* Icon */}
                      {done
                        ? <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1A7F4E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>
                          </div>
                        : isCurrent
                          ? <div style={{ width: 18, height: 18, borderRadius: '50%', background: ORANGE, flexShrink: 0, marginTop: 1, animation: 'pulse 1.5s ease-in-out infinite' }} />
                          : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #D1D5DB', flexShrink: 0, marginTop: 1 }} />
                      }
                      <div>
                        <span style={{ fontSize: 13, fontWeight: done || isCurrent ? 600 : 400, color: done ? '#374151' : isCurrent ? NAVY : '#9CA3AF' }}>
                          {schema}
                        </span>
                        {done && (
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                            {s.rowCount} rows · {new Date(s.completedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #F3F4F6', margin: '0 0 12px' }} />

              {/* Update credentials */}
              {selected.fmx_site_url && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setShowUpdateCreds(v => !v); setUpdateConnStatus(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', padding: 0, textDecoration: 'underline' }}
                  >
                    {showUpdateCreds ? 'Cancel' : (selected.fmx_credentials ? 'Update API credentials' : 'Add API credentials')}
                  </button>
                  {showUpdateCreds && (
                    <div style={{ marginTop: 10, padding: '12px 14px', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 3 }}>API email</label>
                        <input style={{ ...inputStyle, fontSize: 13, padding: '7px 10px' }} type="email" placeholder="admin@example.com" value={updateEmail} onChange={e => { setUpdateEmail(e.target.value); setUpdateConnStatus(null); }} />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 3 }}>API password</label>
                        <input style={{ ...inputStyle, fontSize: 13, padding: '7px 10px' }} type="password" placeholder="••••••••" value={updatePassword} onChange={e => { setUpdatePassword(e.target.value); setUpdateConnStatus(null); }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <button
                          type="button"
                          onClick={handleTestUpdateConn}
                          disabled={!updateEmail || !updatePassword || updateConnLoading}
                          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {updateConnLoading ? 'Testing…' : 'Test'}
                        </button>
                        {updateConnStatus && (
                          <span style={{ fontSize: 12, color: updateConnStatus === 'ok' ? '#1A7F4E' : '#DC2626', fontWeight: 500 }}>
                            {updateConnMsg}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveUpdateCreds}
                        disabled={!updateEmail || !updatePassword || updateSaving}
                        style={{ fontSize: 13, padding: '6px 14px', borderRadius: 5, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer', opacity: (!updateEmail || !updatePassword) ? 0.5 : 1 }}
                      >
                        {updateSaving ? 'Saving…' : 'Save credentials'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => onSelectProject(selected)}
                style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 600, background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 16 }}
              >
                Open project →
              </button>

              {/* Delete */}
              {!deleteConfirm
                ? <p style={{ textAlign: 'center', margin: 0 }}>
                    <button onClick={() => setDeleteConfirm(true)} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}>
                      Delete project
                    </button>
                  </p>
                : <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: '#DC2626' }}>Are you sure? This cannot be undone.</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={handleDelete} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>Yes, delete</button>
                      <button onClick={() => setDeleteConfirm(false)} style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
