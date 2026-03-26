import { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, getProjectStatus, updateProject, saveProjectCredentials, getProjectImports, getImportRows, renameImport, getAllReferenceValues } from '../db';
import { encodeCredentials, testFmxConnection } from '../fmxSync';
import { downloadCSV } from '../utils';
import { IMPORT_ORDER } from '../schemas';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const GREEN = '#1A7F4E';

// Dependency chains: which schema types provide reference values to others
const DEPENDENCY_CHAINS = [
  { provider: 'Building',       consumers: ['Resource', 'User', 'Equipment', 'Inventory'] },
  { provider: 'Equipment Type', consumers: ['Equipment'] },
];

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ completedCount }) {
  if (completedCount === 6)
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: GREEN }}>Complete</span>;
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

// Schema status icon
function SchemaIcon({ done, isCurrent }) {
  if (done) return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
    </div>
  );
  if (isCurrent) return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: ORANGE, flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
  return <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #D1D5DB', flexShrink: 0 }} />;
}

// Single import card component
function ImportCard({ rec, hasCreds, renamingId, renameVal, setRenamingId, setRenameVal, onRenameSubmit, onDownload, onView, onResume, onRepush }) {
  const isRenaming = renamingId === rec.id;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderLeft: `3px solid ${ORANGE}`,
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Name row */}
      <div style={{ marginBottom: 4 }}>
        {isRenaming
          ? <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => onRenameSubmit(rec.id)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenamingId(null); }}
              style={{ fontSize: 13, fontWeight: 600, border: 'none', borderBottom: `1.5px solid ${ORANGE}`, outline: 'none', background: 'transparent', width: '100%', color: NAVY, fontFamily: 'system-ui, -apple-system, sans-serif' }}
            />
          : <span
              onClick={() => { setRenamingId(rec.id); setRenameVal(rec.import_name || rec.schema_type); }}
              title="Click to rename"
              style={{ fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'text', borderBottom: '1px dashed transparent' }}
              onMouseEnter={e => e.currentTarget.style.borderBottomColor = '#D1D5DB'}
              onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            >
              {rec.import_name || rec.schema_type}
            </span>
        }
      </div>
      {/* Meta row */}
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>
        {(rec.row_count_stored ?? rec.row_count) || 0} rows
        {rec.truncated ? ' (capped at 5,000)' : ''}
        {' · '}{fmtDate(rec.completed_at)}
        {rec.source_filename ? ` · ${rec.source_filename}` : ''}
      </div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <ActionBtn onClick={onDownload} label="↓ Download" />
        <Dot />
        <ActionBtn onClick={onView} label="👁 View" />
        <Dot />
        <ActionBtn onClick={onResume} label="▶ Resume" color={ORANGE} />
        {hasCreds && (<>
          <Dot />
          <ActionBtn onClick={onRepush} label="⬆ Re-push" color={GREEN} />
        </>)}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, color = NAVY }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color, padding: '2px 4px', fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500 }}
    >
      {label}
    </button>
  );
}

function Dot() {
  return <span style={{ color: '#D1D5DB', fontSize: 11 }}>·</span>;
}

export default function ProjectScreen({ onSelectProject, onResumeImport }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'create'
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState('');

  // Tabs for project detail panel
  const [activeTab, setActiveTab] = useState('imports'); // 'imports' | 'dependencies' | 'settings'

  // create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fmxSiteUrl, setFmxSiteUrl] = useState('');
  const [fmxApiEmail, setFmxApiEmail] = useState('');
  const [fmxApiPassword, setFmxApiPassword] = useState('');
  const [apiExpanded, setApiExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createConnStatus, setCreateConnStatus] = useState(null);
  const [createConnMsg, setCreateConnMsg] = useState('');
  const [createConnLoading, setCreateConnLoading] = useState(false);
  const [createConnVerified, setCreateConnVerified] = useState(false);

  // import history
  const [imports, setImports] = useState([]);
  const [viewModal, setViewModal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  // dependencies tab
  const [refValues, setRefValues] = useState([]); // all project_reference_values rows

  // settings / update credentials
  const [showUpdateCreds, setShowUpdateCreds] = useState(false);
  const [updateEmail, setUpdateEmail] = useState('');
  const [updatePassword, setUpdatePassword] = useState('');
  const [updateConnStatus, setUpdateConnStatus] = useState(null);
  const [updateConnMsg, setUpdateConnMsg] = useState('');
  const [updateConnLoading, setUpdateConnLoading] = useState(false);
  const [updateSaving, setUpdateSaving] = useState(false);
  // settings — FMX URL editing
  const [editingUrl, setEditingUrl] = useState(false);
  const [editUrlVal, setEditUrlVal] = useState('');

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

  const loadImports = async (projectId) => {
    const data = await getProjectImports(projectId);
    setImports(data);
  };

  const loadRefValues = async (projectId) => {
    const data = await getAllReferenceValues(projectId);
    setRefValues(data);
  };

  const handleSelectProject = (p) => {
    setSelected(p);
    setMode('idle');
    setDeleteConfirm(false);
    setEditingName(false);
    setRenamingId(null);
    setShowUpdateCreds(false);
    setActiveTab('imports');
    loadStatus(p.id);
    loadImports(p.id);
    loadRefValues(p.id);
  };

  const handleDownloadImport = async (rec) => {
    const rows = await getImportRows(rec.id);
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const filename = `${rec.import_name || rec.schema_type}.csv`;
    downloadCSV(filename, headers, rows);
  };

  const handleViewImport = async (rec) => {
    setViewLoading(true);
    setViewModal({ rec, rows: [] });
    const rows = await getImportRows(rec.id);
    setViewModal({ rec, rows: rows || [] });
    setViewLoading(false);
  };

  const handleResumeImport = async (rec, step = 3) => {
    const rows = await getImportRows(rec.id);
    if (onResumeImport) {
      onResumeImport({
        schemaType: rec.schema_type,
        mappedRows: rows || [],
        mapping: rec.mapping_snapshot || {},
        wStep: step,
      });
    }
  };

  const handleRenameSubmit = async (id) => {
    if (renameVal.trim()) await renameImport(id, renameVal.trim());
    setRenamingId(null);
    setRenameVal('');
    if (selected) loadImports(selected.id);
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
    const url = editingUrl ? editUrlVal : selected.fmx_site_url;
    const result = await testFmxConnection(url, updateEmail, updatePassword);
    setUpdateConnStatus(result.success ? 'ok' : 'fail');
    setUpdateConnMsg(result.message);
    setUpdateConnLoading(false);
  };

  const handleSaveUpdateCreds = async () => {
    setUpdateSaving(true);
    const encoded = encodeCredentials(updateEmail, updatePassword);
    const verified = updateConnStatus === 'ok';
    const updated = await saveProjectCredentials(selected.id, encoded, verified);
    if (updated) {
      setSelected(updated);
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      setShowUpdateCreds(false);
      setUpdateEmail(''); setUpdatePassword(''); setUpdateConnStatus(null);
    }
    setUpdateSaving(false);
  };

  const handleUrlBlur = async () => {
    if (editUrlVal.trim() && editUrlVal !== selected.fmx_site_url) {
      const updated = await updateProject(selected.id, { fmx_site_url: editUrlVal.trim() });
      if (updated) {
        setSelected(updated);
        setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      }
    }
    setEditingUrl(false);
  };

  const handleDelete = async () => {
    await deleteProject(selected.id);
    setSelected(null);
    setStatus({});
    setImports([]);
    setRefValues([]);
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

  const cnt = selected ? IMPORT_ORDER.filter(s => status[s]?.complete).length : 0;

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

  const tabStyle = (tab) => ({
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? ORANGE : '#6B7280',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? `2px solid ${ORANGE}` : '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transition: 'color 0.15s',
  });

  // Group imports by schema type
  const importsBySchema = {};
  for (const imp of imports) {
    if (!importsBySchema[imp.schema_type]) importsBySchema[imp.schema_type] = [];
    importsBySchema[imp.schema_type].push(imp);
  }

  // Group reference values by schema type (for dependencies tab)
  const refBySchema = {};
  for (const row of refValues) {
    if (!refBySchema[row.schema_type]) refBySchema[row.schema_type] = {};
    if (!refBySchema[row.schema_type][row.field_name]) refBySchema[row.schema_type][row.field_name] = [];
    refBySchema[row.schema_type][row.field_name].push(row.value);
  }

  const hasCreds = !!selected?.fmx_credentials;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .proj-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .import-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      `}</style>

      {/* View modal */}
      {viewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{viewModal.rec.import_name || viewModal.rec.schema_type}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: '#9CA3AF' }}>{viewModal.rec.schema_type} · {(viewModal.rec.row_count_stored ?? viewModal.rec.row_count) || 0} rows</span>
              </div>
              <button onClick={() => setViewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {viewLoading
                ? <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
                : viewModal.rows.length === 0
                  ? <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No row data stored for this import.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                          {Object.keys(viewModal.rows[0]).map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {viewModal.rows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            {Object.keys(viewModal.rows[0]).map(h => (
                              <td key={h} style={{ padding: '6px 10px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
              }
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { if (viewModal.rows.length > 0) { const h = Object.keys(viewModal.rows[0]); downloadCSV(`${viewModal.rec.import_name || viewModal.rec.schema_type}.csv`, h, viewModal.rows); } }}
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Download CSV
              </button>
              <button onClick={() => setViewModal(null)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', minHeight: 400, overflow: 'hidden' }}>

          {/* STATE A — Nothing selected */}
          {mode === 'idle' && !selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360, color: '#9CA3AF', fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: '0 2rem' }}>
              Select a project to view details, or create a new one
            </div>
          )}

          {/* STATE B — Create form */}
          {mode === 'create' && (
            <div style={{ padding: '24px 24px' }}>
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
                        <span style={{ fontSize: 12, color: createConnStatus === 'ok' ? GREEN : '#DC2626', fontWeight: 500 }}>
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
            </div>
          )}

          {/* STATE C — Project detail */}
          {mode === 'idle' && selected && (
            <div>
              {/* Project header */}
              <div style={{ padding: '20px 24px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {editingName
                    ? <input
                        autoFocus
                        value={editNameVal}
                        onChange={e => setEditNameVal(e.target.value)}
                        onBlur={handleNameBlur}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        style={{ fontSize: 17, fontWeight: 700, color: NAVY, border: 'none', borderBottom: `2px solid ${ORANGE}`, outline: 'none', flex: 1, background: 'transparent', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                      />
                    : <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{selected.name}</span>
                  }
                  <button
                    onClick={() => { setEditingName(true); setEditNameVal(selected.name); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: '2px 4px' }}
                    title="Edit name"
                  >✏️</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {selected.fmx_site_url && (
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{selected.fmx_site_url}</span>
                  )}
                  {selected.fmx_connection_verified && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: GREEN, whiteSpace: 'nowrap' }}>
                      ✓ FMX Connected
                    </span>
                  )}
                </div>

                {/* Open project button */}
                <button
                  onClick={() => onSelectProject(selected)}
                  style={{ width: '100%', height: 40, fontSize: 14, fontWeight: 600, background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 12, marginBottom: 16 }}
                >
                  Open project →
                </button>
              </div>

              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', padding: '0 24px' }}>
                <button style={tabStyle('imports')} onClick={() => setActiveTab('imports')}>Imports</button>
                <button style={tabStyle('dependencies')} onClick={() => setActiveTab('dependencies')}>Dependencies</button>
                <button style={tabStyle('settings')} onClick={() => setActiveTab('settings')}>Settings</button>
              </div>

              {/* ── IMPORTS TAB ── */}
              {activeTab === 'imports' && (
                <div style={{ padding: '16px 24px' }}>
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 14px' }}>
                    {statusLoading ? 'Loading…' : `${cnt} of 6 schemas complete`}
                  </p>

                  {IMPORT_ORDER.map((schema, i) => {
                    const s = status[schema];
                    const done = s?.complete;
                    const isCurrent = !done && IMPORT_ORDER.slice(0, i).every(prev => status[prev]?.complete);
                    const schemaImports = importsBySchema[schema] || [];

                    return (
                      <div key={schema} style={{ marginBottom: 16 }}>
                        {/* Schema header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: schemaImports.length > 0 ? 8 : 0 }}>
                          <SchemaIcon done={done} isCurrent={isCurrent} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: done ? '#374151' : isCurrent ? NAVY : '#9CA3AF', flex: 1 }}>
                            {schema}
                          </span>
                          {schemaImports.length > 1 && (
                            <span style={{ fontSize: 11, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 10, padding: '1px 7px' }}>
                              {schemaImports.length}
                            </span>
                          )}
                        </div>

                        {/* Import cards */}
                        {schemaImports.map(rec => (
                          <ImportCard
                            key={rec.id}
                            rec={rec}
                            hasCreds={hasCreds}
                            renamingId={renamingId}
                            renameVal={renameVal}
                            setRenamingId={setRenamingId}
                            setRenameVal={setRenameVal}
                            onRenameSubmit={handleRenameSubmit}
                            onDownload={() => handleDownloadImport(rec)}
                            onView={() => handleViewImport(rec)}
                            onResume={() => handleResumeImport(rec, 3)}
                            onRepush={() => handleResumeImport(rec, 4)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── DEPENDENCIES TAB ── */}
              {activeTab === 'dependencies' && (
                <div style={{ padding: '16px 24px' }}>
                  <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                    Reference values saved from completed imports. Downstream schema types rely on these to resolve cross-sheet links at push time.
                  </p>

                  {DEPENDENCY_CHAINS.map(({ provider, consumers }) => {
                    const providerRefs = refBySchema[provider] || {};
                    const allValues = Object.values(providerRefs).flat();
                    const uniqueValues = [...new Set(allValues)].sort();

                    return (
                      <div key={provider} style={{ marginBottom: 24 }}>
                        {/* Chain heading */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{provider}</span>
                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>→</span>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>{consumers.join(', ')}</span>
                        </div>
                        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
                          {uniqueValues.length === 0
                            ? <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: '4px 0 0' }}>
                                No {provider} data saved yet — complete a {provider} import first.
                              </p>
                            : uniqueValues.map(val => (
                                <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #F9FAFB' }}>
                                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#E6F4EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>
                                  </div>
                                  <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{val}</span>
                                  <span style={{ fontSize: 10, color: '#D1D5DB', fontStyle: 'italic' }}>resolved at push</span>
                                </div>
                              ))
                          }
                        </div>
                        {uniqueValues.length > 0 && (
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '6px 0 0' }}>
                            {uniqueValues.length} value{uniqueValues.length !== 1 ? 's' : ''} saved
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── SETTINGS TAB ── */}
              {activeTab === 'settings' && (
                <div style={{ padding: '16px 24px' }}>

                  {/* FMX site URL */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>FMX Site URL</label>
                    {editingUrl
                      ? <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            autoFocus
                            value={editUrlVal}
                            onChange={e => setEditUrlVal(e.target.value)}
                            onBlur={handleUrlBlur}
                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                            style={{ ...inputStyle, fontSize: 13, padding: '7px 10px', flex: 1 }}
                            placeholder="yoursite.gofmx.com"
                          />
                        </div>
                      : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: selected.fmx_site_url ? '#374151' : '#9CA3AF', flex: 1 }}>
                            {selected.fmx_site_url || 'Not set'}
                          </span>
                          <button
                            onClick={() => { setEditingUrl(true); setEditUrlVal(selected.fmx_site_url || ''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', textDecoration: 'underline', padding: 0 }}
                          >
                            Edit
                          </button>
                        </div>
                    }
                  </div>

                  {/* API credentials */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                      API Credentials
                      {selected.fmx_connection_verified && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 8, background: '#E6F4EE', color: GREEN, textTransform: 'none', letterSpacing: 0 }}>✓ Verified</span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowUpdateCreds(v => !v); setUpdateConnStatus(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', padding: 0, textDecoration: 'underline' }}
                    >
                      {showUpdateCreds ? 'Cancel' : (selected.fmx_credentials ? 'Update credentials' : 'Add credentials')}
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
                            <span style={{ fontSize: 12, color: updateConnStatus === 'ok' ? GREEN : '#DC2626', fontWeight: 500 }}>
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

                  <hr style={{ border: 'none', borderTop: '1px solid #F3F4F6', margin: '16px 0' }} />

                  {/* Danger zone */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Danger Zone</label>
                    {!deleteConfirm
                      ? <button onClick={() => setDeleteConfirm(true)} style={{ background: 'none', border: '1px solid #FECACA', color: '#DC2626', fontSize: 12, cursor: 'pointer', borderRadius: 5, padding: '5px 12px' }}>
                          Delete project
                        </button>
                      : <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', textAlign: 'center' }}>
                          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#DC2626' }}>Are you sure? This cannot be undone.</p>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button onClick={handleDelete} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>Yes, delete</button>
                            <button onClick={() => setDeleteConfirm(false)} style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 5, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
