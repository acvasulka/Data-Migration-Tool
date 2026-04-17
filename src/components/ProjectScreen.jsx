import { useState, useEffect, useMemo } from 'react';
import { getProjectsByOwner, getOtherProjects, createProject, deleteProject, getProjectStatus, updateProject, getProjectImports, getImportRows, renameImport, getAllReferenceValues, getAllProfiles, getCurrentProfile, updateProjectOwner, getProjectByFmxUrl, getImportSummaryForProjects, updateProjectModules, claimProject } from '../db';
import { encodeCredentials, testFmxConnection, fetchFmxModules } from '../fmxSync';
import { downloadCSV } from '../utils';
import { IMPORT_ORDER, getImportOrder, getBaseSchemaType, getSchemaModuleSlug } from '../schemas';
import { supabase } from '../supabase';
import UserMenu from './UserMenu';
import ProfileEditModal from './ProfileEditModal';
import AdminPanelModal from './AdminPanelModal';
import ProjectSettingsView from './ProjectSettingsView';
import PushHistoryView from './PushHistoryView';

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

function StatusBadge({ completedCount, totalCount = 6 }) {
  if (completedCount >= totalCount && totalCount > 0)
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: GREEN }}>Complete</span>;
  if (completedCount > 0)
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#FFF3CD', color: '#856404' }}>In progress</span>;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#6B7280' }}>Not started</span>;
}

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', padding: '20px 24px' }}>
      <div style={{ height: 16, background: '#E5E7EB', borderRadius: 4, width: '60%', marginBottom: 12, animation: 'shimmer 1.4s infinite' }} />
      <div style={{ height: 10, background: '#F3F4F6', borderRadius: 4, width: '40%', marginBottom: 14 }} />
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
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>
    </div>
  );
  if (isCurrent) return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: ORANGE, flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
  return <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #D1D5DB', flexShrink: 0 }} />;
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

// Compute progress for a project based on card_settings and import summary.
// Uses module-aware expansion (Work Request:maintenance, Work Request:it, etc.) from getImportOrder,
// falling back to defaults when fmx_modules is missing.
function computeProgress(project, importedSchemas) {
  const settings = project.card_settings || {};
  const fullOrder = getImportOrder(project.fmx_modules);
  const activeSchemas = fullOrder.filter(s => !settings[s]?.hidden);
  const completed = activeSchemas.filter(s => importedSchemas.has(s));
  return { total: activeSchemas.length, completed: completed.length, activeSchemas, completedSchemas: new Set(completed) };
}

// Compact label for a schema (used in the progress-dot row on cards).
// For module-qualified types ("Work Request:maintenance"), returns base type first letter.
function schemaShortLabel(schema) {
  const base = getBaseSchemaType(schema);
  return base.charAt(0).toUpperCase();
}

export default function ProjectScreen({ user, onSelectProject, onResumeImport, activeProjectId, activeWizardSchema }) {
  const [myProjects, setMyProjects] = useState([]);
  const [otherProjects, setOtherProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [activeListTab, setActiveListTab] = useState('mine'); // 'mine' | 'others'

  // Expanded card state
  const [expandedId, setExpandedId] = useState(null);
  const [expandedStatus, setExpandedStatus] = useState({});
  const [expandedImports, setExpandedImports] = useState([]);
  const [expandedRefValues, setExpandedRefValues] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Inline card editing
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState('');
  const [ownerEditing, setOwnerEditing] = useState(false);

  // Detail tabs inside expanded card
  const [detailTab, setDetailTab] = useState('imports'); // 'imports' | 'dependencies' | 'settings'

  // Create form
  const [mode, setMode] = useState('idle'); // 'idle' | 'create'
  const [fmxSiteUrl, setFmxSiteUrl] = useState('');
  const [fmxApiEmail, setFmxApiEmail] = useState('');
  const [fmxApiPassword, setFmxApiPassword] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createStep, setCreateStep] = useState(''); // '', 'testing', 'fetching', 'checking', 'creating'
  const [orgName, setOrgName] = useState('');
  const [manualName, setManualName] = useState('');
  const [needsManualName, setNeedsManualName] = useState(false);
  const [duplicateProject, setDuplicateProject] = useState(null);

  // Import history (for expanded card)
  const [viewModal, setViewModal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  // (Settings UI is now delegated to ProjectSettingsView; delete is handled below via deleteConfirm state.)

  // Import summary for all projects (for card progress)
  const [importSummaryMap, setImportSummaryMap] = useState({}); // { [projectId]: Set<schemaType> }

  // User menu modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const profileMap = useMemo(() => {
    const map = {};
    for (const p of allProfiles) map[p.id] = p.full_name || p.email || 'Unknown';
    return map;
  }, [allProfiles]);

  const isAdmin = currentProfile?.role === 'admin';

  const loadProjects = async () => {
    setLoading(true);
    const [mine, others, profiles, profile] = await Promise.all([
      getProjectsByOwner(user.id),
      getOtherProjects(user.id),
      getAllProfiles(),
      getCurrentProfile(user.id),
    ]);
    setMyProjects(mine);
    setOtherProjects(others);
    setAllProfiles(profiles);
    setCurrentProfile(profile);

    // Load import summary for all projects
    const allIds = [...mine, ...others].map(p => p.id);
    if (allIds.length > 0) {
      const summary = await getImportSummaryForProjects(allIds);
      const map = {};
      for (const row of summary) {
        if (!map[row.project_id]) map[row.project_id] = new Set();
        map[row.project_id].add(row.schema_type);
      }
      setImportSummaryMap(map);
    }

    setLoading(false);
  };

  useEffect(() => { loadProjects(); }, []);

  const loadExpandedDetails = async (projectId) => {
    setStatusLoading(true);
    const [s, imports, refVals] = await Promise.all([
      getProjectStatus(projectId),
      getProjectImports(projectId),
      getAllReferenceValues(projectId),
    ]);
    setExpandedStatus(s);
    setExpandedImports(imports);
    setExpandedRefValues(refVals);
    setStatusLoading(false);
  };

  const handleCardClick = (p) => {
    if (expandedId === p.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(p.id);
    setDetailTab('imports');
    setDeleteConfirm(false);
    setEditingName(false);
    setOwnerEditing(false);
    setRenamingId(null);
    loadExpandedDetails(p.id);
  };

  const getExpanded = () => {
    return [...myProjects, ...otherProjects].find(p => p.id === expandedId) || null;
  };

  const handleDownloadImport = async (rec) => {
    const rows = await getImportRows(rec.id);
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    downloadCSV(`${rec.import_name || rec.schema_type}.csv`, headers, rows);
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
    if (expandedId) loadExpandedDetails(expandedId);
  };

  const handleConnectAndCreate = async (e) => {
    if (e) e.preventDefault();
    setCreating(true);
    setCreateError('');
    setDuplicateProject(null);
    setNeedsManualName(false);
    setOrgName('');

    // Step 1: Test connection
    setCreateStep('testing');
    const connResult = await testFmxConnection(fmxSiteUrl, fmxApiEmail, fmxApiPassword);
    if (!connResult.success) {
      setCreateError(connResult.message);
      setCreating(false);
      setCreateStep('');
      return;
    }

    // Step 2: Fetch org info
    setCreateStep('fetching');
    const { orgName: fetchedOrgName, ...modules } = await fetchFmxModules(fmxSiteUrl, fmxApiEmail, fmxApiPassword);

    if (!fetchedOrgName) {
      setNeedsManualName(true);
      setCreating(false);
      setCreateStep('');
      return;
    }
    setOrgName(fetchedOrgName);

    // Step 3: Check for duplicate by FMX URL
    setCreateStep('checking');
    const existing = await getProjectByFmxUrl(fmxSiteUrl.trim());
    if (existing) {
      setDuplicateProject(existing);
      setCreating(false);
      setCreateStep('');
      return;
    }

    // Step 4: Create project
    setCreateStep('creating');
    const encoded = encodeCredentials(fmxApiEmail, fmxApiPassword);
    const project = await createProject(fetchedOrgName, description.trim() || null, fmxSiteUrl.trim(), encoded, true, user.id);
    if (!project) {
      setCreateError('Failed to create project. Please try again.');
      setCreating(false);
      setCreateStep('');
      return;
    }

    // Step 5: Save modules
    await updateProjectModules(project.id, modules);

    // Step 6: Refresh and expand
    await loadProjects();
    setMode('idle');
    setFmxSiteUrl(''); setFmxApiEmail(''); setFmxApiPassword(''); setDescription('');
    setCreateStep('');
    setCreating(false);
    setActiveListTab('mine');
    setExpandedId(project.id);
    loadExpandedDetails(project.id);
  };

  const handleCreateWithManualName = async () => {
    if (!manualName.trim()) return;
    setCreating(true);
    setCreateError('');
    setCreateStep('creating');

    const encoded = encodeCredentials(fmxApiEmail, fmxApiPassword);
    const { orgName: _o, ...modules } = await fetchFmxModules(fmxSiteUrl, fmxApiEmail, fmxApiPassword);
    const project = await createProject(manualName.trim(), description.trim() || null, fmxSiteUrl.trim(), encoded, true, user.id);
    if (!project) {
      setCreateError('Failed to create project.');
      setCreating(false);
      setCreateStep('');
      return;
    }
    await updateProjectModules(project.id, modules);
    await loadProjects();
    setMode('idle');
    setFmxSiteUrl(''); setFmxApiEmail(''); setFmxApiPassword(''); setDescription('');
    setManualName(''); setNeedsManualName(false);
    setCreateStep('');
    setCreating(false);
    setActiveListTab('mine');
    setExpandedId(project.id);
    loadExpandedDetails(project.id);
  };

  const handleDelete = async () => {
    await deleteProject(expandedId);
    setExpandedId(null);
    setDeleteConfirm(false);
    await loadProjects();
  };

  const handleNameBlur = async () => {
    const expanded = getExpanded();
    if (expanded && editNameVal.trim() && editNameVal !== expanded.name) {
      const updated = await updateProject(expanded.id, { name: editNameVal.trim() });
      if (updated) await loadProjects();
    }
    setEditingName(false);
  };

  const handleClaim = async (projectId) => {
    const result = await claimProject(projectId, user.id);
    if (result) {
      await loadProjects();
      setActiveListTab('mine');
    }
  };

  const handleOwnerChange = async (newOwnerId) => {
    const updated = await updateProjectOwner(expandedId, newOwnerId);
    if (updated) {
      await loadProjects();
      // If we just transferred to someone else, the card might now be in 'others'
      if (newOwnerId !== user.id) setActiveListTab('others');
    }
    setOwnerEditing(false);
  };

  // URL edit and credentials save are handled inside ProjectSettingsView now.

  const expanded = getExpanded();
  const expandedOrder = expanded ? getImportOrder(expanded.fmx_modules) : IMPORT_ORDER;
  const expandedCnt = expanded ? expandedOrder.filter(s => expandedStatus[s]?.complete).length : 0;

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6,
    border: '1px solid #D1D5DB', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const detailTabStyle = (tab) => ({
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: detailTab === tab ? 600 : 400,
    color: detailTab === tab ? ORANGE : '#6B7280',
    background: 'none',
    border: 'none',
    borderBottom: detailTab === tab ? `2px solid ${ORANGE}` : '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });

  // Group expanded imports by schema type
  const importsBySchema = {};
  for (const imp of expandedImports) {
    if (!importsBySchema[imp.schema_type]) importsBySchema[imp.schema_type] = [];
    importsBySchema[imp.schema_type].push(imp);
  }

  // Group reference values by schema type
  const refBySchema = {};
  for (const row of expandedRefValues) {
    if (!refBySchema[row.schema_type]) refBySchema[row.schema_type] = {};
    if (!refBySchema[row.schema_type][row.field_name]) refBySchema[row.schema_type][row.field_name] = [];
    refBySchema[row.schema_type][row.field_name].push(row.value);
  }

  const hasCreds = !!expanded?.fmx_credentials;
  const displayedProjects = activeListTab === 'mine' ? myProjects : otherProjects;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .proj-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
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
              >Download CSV</button>
              <button onClick={() => setViewModal(null)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {mode === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 480, padding: '28px 32px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>New project</h2>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>FMX site URL *</label>
              <input style={inputStyle} value={fmxSiteUrl} onChange={e => { setFmxSiteUrl(e.target.value); setDuplicateProject(null); }} placeholder="yoursite.gofmx.com" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>FMX API email *</label>
              <input style={inputStyle} type="email" value={fmxApiEmail} onChange={e => setFmxApiEmail(e.target.value)} placeholder="admin@example.com" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>FMX API password *</label>
              <input style={inputStyle} type="password" value={fmxApiPassword} onChange={e => setFmxApiPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Notes about this migration (team, target go-live, etc.)"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'system-ui, -apple-system, sans-serif' }}
              />
            </div>

            {/* Org name detected */}
            {orgName && !duplicateProject && (
              <div style={{ background: '#E6F4EE', padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: 13, color: '#1A5C38' }}>
                Organization: <strong>{orgName}</strong>
              </div>
            )}

            {/* Duplicate warning */}
            {duplicateProject && (
              <div style={{ background: '#FFF3CD', padding: '12px 14px', borderRadius: 6, marginBottom: 14, fontSize: 13, color: '#856404' }}>
                <p style={{ margin: '0 0 8px' }}>A project for this FMX site already exists: <strong>{duplicateProject.name}</strong></p>
                <button
                  onClick={() => {
                    setMode('idle');
                    setDuplicateProject(null);
                    setActiveListTab(duplicateProject.user_id === user.id ? 'mine' : 'others');
                    setExpandedId(duplicateProject.id);
                    loadExpandedDetails(duplicateProject.id);
                  }}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 5, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer', fontWeight: 500 }}
                >Open existing project</button>
              </div>
            )}

            {/* Manual name fallback */}
            {needsManualName && (
              <div style={{ background: '#FFF8F0', padding: '12px 14px', borderRadius: 6, marginBottom: 14, border: '1px solid #FFE0B2' }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6D4C1A' }}>Could not detect organization name. Please enter one:</p>
                <input
                  style={inputStyle}
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Riverside School District"
                  autoFocus
                />
                <button
                  onClick={handleCreateWithManualName}
                  disabled={!manualName.trim() || creating}
                  style={{ marginTop: 8, fontSize: 13, padding: '6px 16px', borderRadius: 6, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer', opacity: !manualName.trim() ? 0.5 : 1 }}
                >Create project</button>
              </div>
            )}

            {createError && <p style={{ color: '#DC2626', fontSize: 13, margin: '0 0 14px' }}>{createError}</p>}

            {/* Progress indicator */}
            {creating && createStep && (
              <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 14px' }}>
                {createStep === 'testing' && 'Testing connection…'}
                {createStep === 'fetching' && 'Fetching organization info…'}
                {createStep === 'checking' && 'Checking for duplicates…'}
                {createStep === 'creating' && 'Creating project…'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={handleConnectAndCreate}
                disabled={!fmxSiteUrl || !fmxApiEmail || !fmxApiPassword || creating || !!duplicateProject}
                style={{ flex: 1, padding: 10, fontSize: 14, fontWeight: 500, background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: creating ? 'not-allowed' : 'pointer', opacity: (!fmxSiteUrl || !fmxApiEmail || !fmxApiPassword || creating || !!duplicateProject) ? 0.5 : 1 }}
              >
                {creating ? 'Connecting…' : 'Connect & Create'}
              </button>
              <button
                onClick={() => { setMode('idle'); setCreateError(''); setDuplicateProject(null); setNeedsManualName(false); setOrgName(''); setDescription(''); }}
                style={{ padding: '10px 20px', fontSize: 14, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', color: '#6B7280' }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile edit modal */}
      {showProfileModal && (
        <ProfileEditModal
          user={user}
          profile={currentProfile}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={async () => { await loadProjects(); }}
        />
      )}

      {/* Admin panel modal */}
      {showAdminPanel && (
        <AdminPanelModal
          currentUser={user}
          currentProfile={currentProfile}
          allProfiles={allProfiles}
          projects={[...myProjects, ...otherProjects]}
          onClose={() => setShowAdminPanel(false)}
          onProfilesChanged={async () => { await loadProjects(); }}
        />
      )}

      {/* Header */}
      <div style={{ height: 52, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
        <UserMenu
          user={user}
          profile={currentProfile}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenAdminPanel={() => setShowAdminPanel(true)}
          onSignOut={async () => { await supabase.auth.signOut(); }}
        />
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>

        {/* Tab bar + New project button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 0 }}>
            <button
              onClick={() => setActiveListTab('mine')}
              style={{
                padding: '10px 20px', fontSize: 15, fontWeight: activeListTab === 'mine' ? 600 : 400,
                color: activeListTab === 'mine' ? NAVY : '#9CA3AF',
                borderBottom: activeListTab === 'mine' ? `2px solid ${ORANGE}` : '2px solid transparent',
                background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              My Projects ({myProjects.length})
            </button>
            <button
              onClick={() => setActiveListTab('others')}
              style={{
                padding: '10px 20px', fontSize: 15, fontWeight: activeListTab === 'others' ? 600 : 400,
                color: activeListTab === 'others' ? NAVY : '#9CA3AF',
                borderBottom: activeListTab === 'others' ? `2px solid ${ORANGE}` : '2px solid transparent',
                background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              Other Projects ({otherProjects.length})
            </button>
          </div>
          <button
            onClick={() => { setMode('create'); setExpandedId(null); setCreateError(''); setDuplicateProject(null); setNeedsManualName(false); setOrgName(''); }}
            style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >+ New project</button>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayedProjects.length === 0 && (
          (() => {
            const unassignedCount = otherProjects.filter(p => !p.user_id).length;
            const showUnassignedCta = activeListTab === 'mine' && unassignedCount > 0;
            return (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <DocumentPlusIcon />
                <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginTop: 16, marginBottom: 6 }}>
                  {activeListTab === 'mine' ? 'No projects yet' : 'No other projects'}
                </p>
                <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
                  {activeListTab === 'mine' ? 'Create your first migration project to get started' : 'Projects owned by other users will appear here'}
                </p>
                {activeListTab === 'mine' && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setMode('create')}
                      style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                    >+ Create project</button>
                    {showUnassignedCta && (
                      <button
                        onClick={() => setActiveListTab('others')}
                        style={{ background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                      >View {unassignedCount} unassigned project{unassignedCount === 1 ? '' : 's'}</button>
                    )}
                  </div>
                )}
                {showUnassignedCta && (
                  <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 14 }}>
                    There {unassignedCount === 1 ? 'is' : 'are'} {unassignedCount} unassigned project{unassignedCount === 1 ? '' : 's'} you can claim.
                  </p>
                )}
              </div>
            );
          })()
        )}

        {/* Project cards grid */}
        {!loading && displayedProjects.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
            {displayedProjects.map(p => {
              const isExpanded = expandedId === p.id;
              const importedSchemas = importSummaryMap[p.id] || new Set();
              const progress = computeProgress(p, importedSchemas);
              const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

              return (
                <div key={p.id} style={{ gridColumn: isExpanded ? '1 / -1' : undefined }}>
                  {/* Card */}
                  <div
                    className={isExpanded ? '' : 'proj-card'}
                    onClick={() => !isExpanded && handleCardClick(p)}
                    style={{
                      background: '#fff',
                      borderRadius: isExpanded ? '10px 10px 0 0' : 10,
                      border: isExpanded ? `1.5px solid ${ORANGE}` : '0.5px solid #E0E0E0',
                      borderBottom: isExpanded ? 'none' : undefined,
                      padding: '20px 24px',
                      cursor: isExpanded ? 'default' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 16, color: NAVY }}>{p.name}</span>
                        {p.id === activeProjectId && activeWizardSchema && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: '#FFF3CD', color: '#856404', whiteSpace: 'nowrap',
                          }}>
                            {activeWizardSchema} in progress
                          </span>
                        )}
                      </div>
                      <StatusBadge completedCount={progress.completed} totalCount={progress.total} />
                    </div>
                    {p.description && (
                      <div
                        title={p.description}
                        style={{
                          fontSize: 12, color: '#6B7280', margin: '0 0 8px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {p.description}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>Owner: {profileMap[p.user_id] || 'Unassigned'}</span>
                      {!p.user_id && !isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClaim(p.id); }}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fff', color: ORANGE, border: `1px solid ${ORANGE}`, cursor: 'pointer', fontWeight: 500 }}
                        >Claim</button>
                      )}
                      {p.fmx_site_url && <span>· {p.fmx_site_url}</span>}
                    </div>

                    {/* Schema progress indicators */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                      {progress.activeSchemas.map(s => {
                        const done = progress.completedSchemas.has(s);
                        const moduleSlug = getSchemaModuleSlug(s);
                        const tooltip = moduleSlug ? `${getBaseSchemaType(s)} · ${moduleSlug}` : s;
                        return (
                          <div key={s} title={tooltip} style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: done ? GREEN : '#F3F4F6',
                            border: done ? 'none' : '1.5px solid #D1D5DB',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: done ? '#fff' : '#9CA3AF',
                          }}>
                            {done ? '✓' : schemaShortLabel(s)}
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 5, background: '#E0E0E0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: ORANGE, borderRadius: 3, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{progress.completed} of {progress.total} data types complete</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{daysSince(p.updated_at) || ''}</span>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && expanded && (
                    <div style={{
                      background: '#fff', borderRadius: '0 0 10px 10px',
                      border: `1.5px solid ${ORANGE}`, borderTop: `1px solid #E5E7EB`,
                      padding: '0',
                    }}>
                      {/* Expanded header */}
                      <div style={{ padding: '16px 24px 0' }}>
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
                            : <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{expanded.name}</span>
                          }
                          {isAdmin && (
                            <button
                              onClick={() => { setEditingName(true); setEditNameVal(expanded.name); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: '2px 4px' }}
                              title="Edit name"
                            >✏️</button>
                          )}
                          {/* Collapse button */}
                          <button
                            onClick={() => setExpandedId(null)}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}
                            title="Collapse"
                          >×</button>
                        </div>

                        {/* Owner row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>Owner:</span>
                          {ownerEditing && isAdmin ? (
                            <select
                              autoFocus
                              value={expanded.user_id || ''}
                              onChange={e => handleOwnerChange(e.target.value)}
                              onBlur={() => setOwnerEditing(false)}
                              style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid #D1D5DB' }}
                            >
                              <option value="">Unassigned</option>
                              {allProfiles.map(pr => (
                                <option key={pr.id} value={pr.id}>{pr.full_name || pr.email}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <span style={{ fontSize: 12, color: NAVY, fontWeight: 500 }}>
                                {profileMap[expanded.user_id] || 'Unassigned'}
                              </span>
                              {isAdmin && (
                                <button
                                  onClick={() => setOwnerEditing(true)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, padding: '0 2px' }}
                                  title="Transfer ownership"
                                >✏️</button>
                              )}
                              {!expanded.user_id && !isAdmin && (
                                <button
                                  onClick={() => handleClaim(expanded.id)}
                                  style={{ fontSize: 11, padding: '2px 10px', borderRadius: 4, background: '#fff', color: ORANGE, border: `1px solid ${ORANGE}`, cursor: 'pointer', fontWeight: 500 }}
                                >Claim this project</button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Connection + URL */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          {expanded.fmx_site_url && (
                            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{expanded.fmx_site_url}</span>
                          )}
                          {expanded.fmx_connection_verified && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#E6F4EE', color: GREEN }}>✓ FMX Connected</span>
                          )}
                        </div>

                        {/* Open project button */}
                        <button
                          onClick={() => onSelectProject(expanded)}
                          style={{ width: '100%', height: 40, fontSize: 14, fontWeight: 600, background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 12 }}
                        >Open project →</button>
                      </div>

                      {/* Detail tabs */}
                      <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', padding: '0 24px' }}>
                        <button style={detailTabStyle('imports')} onClick={() => setDetailTab('imports')}>Imports</button>
                        <button style={detailTabStyle('dependencies')} onClick={() => setDetailTab('dependencies')}>Dependencies</button>
                        <button style={detailTabStyle('pushes')} onClick={() => setDetailTab('pushes')}>Push History</button>
                        <button style={detailTabStyle('settings')} onClick={() => setDetailTab('settings')}>Settings</button>
                      </div>

                      {/* IMPORTS TAB */}
                      {detailTab === 'imports' && (
                        <div style={{ padding: '14px 24px' }}>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 12px' }}>
                            {statusLoading ? 'Loading…' : `${expandedCnt} of ${expandedOrder.length} schemas complete`}
                          </p>
                          {expandedOrder.map((schema, i) => {
                            const s = expandedStatus[schema];
                            const done = s?.complete;
                            const isCurrent = !done && expandedOrder.slice(0, i).every(prev => expandedStatus[prev]?.complete);
                            const schemaImports = importsBySchema[schema] || [];
                            return (
                              <div key={schema} style={{ marginBottom: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: schemaImports.length > 0 ? 6 : 0 }}>
                                  <SchemaIcon done={done} isCurrent={isCurrent} />
                                  <span style={{ fontSize: 13, fontWeight: 600, color: done ? '#374151' : isCurrent ? NAVY : '#9CA3AF', flex: 1 }}>{schema}</span>
                                  {schemaImports.length > 1 && (
                                    <span style={{ fontSize: 11, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 10, padding: '1px 7px' }}>{schemaImports.length}</span>
                                  )}
                                </div>
                                {schemaImports.map(rec => (
                                  <ImportCard
                                    key={rec.id} rec={rec} hasCreds={hasCreds}
                                    renamingId={renamingId} renameVal={renameVal}
                                    setRenamingId={setRenamingId} setRenameVal={setRenameVal}
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

                      {/* DEPENDENCIES TAB */}
                      {detailTab === 'dependencies' && (
                        <div style={{ padding: '14px 24px' }}>
                          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>
                            Reference values saved from completed imports. Downstream schema types rely on these to resolve cross-sheet links at push time.
                          </p>
                          {DEPENDENCY_CHAINS.map(({ provider, consumers }) => {
                            const providerRefs = refBySchema[provider] || {};
                            const allValues = Object.values(providerRefs).flat();
                            const uniqueValues = [...new Set(allValues)].sort();
                            return (
                              <div key={provider} style={{ marginBottom: 20 }}>
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

                      {/* SETTINGS TAB — reuses ProjectSettingsView */}
                      {detailTab === 'pushes' && (
                        <PushHistoryView project={expanded} />
                      )}

                      {detailTab === 'settings' && (
                        <div style={{ padding: '14px 24px' }}>
                          <ProjectSettingsView
                            selectedProject={expanded}
                            onProjectUpdated={async () => { await loadProjects(); }}
                          />

                          <hr style={{ border: 'none', borderTop: '1px solid #F3F4F6', margin: '20px 0 14px' }} />

                          {/* Danger zone (project delete — stays here since it ties to expandedId state) */}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
