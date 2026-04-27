import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import { syncFmxDataForProject } from '../fmxSync';
import { listEquipment, withAttachments, getEquipment, runOcrOnEquipment, proposeAcceptedRows, buildEquipmentPutPayload, updateEquipment, loadCachedOcrForEquipment } from '../equipmentOcr';
import { getAllDependencyCaches, listCachedEquipmentIds } from '../db';

// Equipment Attachment OCR tool.
//
// High-level flow:
//   1) User picks target fields (sourced from /equipment/post-options).
//   2) User chooses Single (one equipment) or Batch (all equipment with attachments).
//   3) For each equipment: fetch attachments -> Claude vision -> proposed field values.
//   4) User confirms per-row -> PUT /v1/equipment/{id} with merged customFields.
export default function EquipmentOcrTab({ project, currentProfile }) {
  const [mode, setMode] = useState('single'); // 'single' | 'batch'

  // post-options fields (system + custom) for Equipment
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [fieldCatalog, setFieldCatalog] = useState({ systemFields: [], customFields: [] });

  // Set of field-row ids the user wants OCR to populate. Transient per session.
  const [selected, setSelected] = useState(() => new Set());

  // Equipment list (loaded lazily — single mode loads once for picker,
  // batch loads on button press).
  const [equipment, setEquipment] = useState(null); // null = not loaded
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState(null);

  // Single-mode picker state
  const [searchTerm, setSearchTerm] = useState('');
  const [pickedEquipmentId, setPickedEquipmentId] = useState(null);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Use the full sync path so the catalog includes custom fields merged
    // from both /post-options (metadata) and /get-options (name map). Plain
    // fetchPostOptions misses custom fields whose metadata only appears in
    // get-options.
    syncFmxDataForProject(project, 'Equipment')
      .then(res => {
        if (cancelled) return;
        setFieldCatalog({ systemFields: res.systemFields || [], customFields: res.customFields || [] });
        setSelected(new Set(defaultSuggestions(res)));
      })
      .catch(e => { if (!cancelled) setLoadError(e?.message || 'Failed to load equipment fields'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project?.id, project?.fmx_modules]);

  // Reset equipment state when project changes.
  useEffect(() => {
    setEquipment(null);
    setPickedEquipmentId(null);
    setSearchTerm('');
  }, [project?.id]);

  const rows = useMemo(() => buildFieldRows(fieldCatalog), [fieldCatalog]);

  const fieldSelection = useMemo(() => rows.filter(r => selected.has(r.id)), [rows, selected]);

  if (!project) {
    return <Empty>Select a project to use this tool.</Empty>;
  }

  // The encrypted `fmx_credentials` column is revoked from the browser
  // (migration 011), so we gate on the public `fmx_connection_verified`
  // boolean — same flag the rest of the app uses (DependenciesView,
  // ProjectSettingsView, etc.). Server-side calls in /api/* still look
  // up the encrypted blob by projectId.
  if (!project.fmx_connection_verified || !project.fmx_site_url) {
    return (
      <Empty>
        This project has no verified FMX credentials. Save credentials in
        Settings → FMX before running OCR.
      </Empty>
    );
  }

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(rows.map(r => r.id)));
  const clearAll = () => setSelected(new Set());

  const loadEquipment = async () => {
    setEquipmentLoading(true);
    setEquipmentError(null);
    try {
      const items = await listEquipment(project.id);
      setEquipment(items);
    } catch (e) {
      setEquipmentError(e?.message || 'Failed to load equipment');
    } finally {
      setEquipmentLoading(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: 0 }}>Equipment Label Property Upload</h2>
          <p style={{ fontSize: 13, color: C.textMid, margin: '4px 0 0' }}>
            Fill blank Equipment fields by OCR-ing attached nameplate photos and spec sheets.
          </p>
        </div>
        <ModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {/* Field selector */}
      <Section title={<>Fields to extract <SubtleCount>({selected.size} of {rows.length} selected)</SubtleCount></>} right={
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <MiniButton onClick={selectAll} disabled={!rows.length}>Select all</MiniButton>
          <MiniButton onClick={clearAll} disabled={!selected.size}>Clear</MiniButton>
        </div>
      }>
        {loading && <Hint>Loading field list from FMX…</Hint>}
        {loadError && <ErrorBox>{loadError}</ErrorBox>}
        {!loading && !loadError && rows.length === 0 && (
          <Hint>No fields available. Check that this FMX site exposes equipment post-options.</Hint>
        )}

        {!loading && !loadError && rows.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 6, maxHeight: 260, overflow: 'auto',
            border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, background: '#FAFAFA',
          }}>
            {rows.map(r => {
              const checked = selected.has(r.id);
              return (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: checked ? C.navyTint : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} />
                  <span style={{ fontSize: 12, color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textLight }}>{r.kind === 'custom' ? 'custom' : r.fieldType}</span>
                </label>
              );
            })}
          </div>
        )}
      </Section>

      {/* Mode-specific runner */}
      {mode === 'single' ? (
        <SingleModePanel
          projectId={project.id}
          userId={currentProfile?.id}
          equipment={equipment}
          equipmentLoading={equipmentLoading}
          equipmentError={equipmentError}
          onLoadEquipment={loadEquipment}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          pickedId={pickedEquipmentId}
          onPick={setPickedEquipmentId}
          fieldSelection={fieldSelection}
        />
      ) : (
        <BatchModePanel
          projectId={project.id}
          userId={currentProfile?.id}
          equipment={equipment}
          equipmentLoading={equipmentLoading}
          equipmentError={equipmentError}
          onLoadEquipment={loadEquipment}
          fieldSelection={fieldSelection}
        />
      )}
    </div>
  );
}

function SingleModePanel({ projectId, userId, equipment, equipmentLoading, equipmentError, onLoadEquipment, searchTerm, setSearchTerm, pickedId, onPick, fieldSelection }) {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  // result: { parsed, fullEquipment, attachments, usage, cacheStats?, fromCache?, lastUpdated? }
  const [result, setResult] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);

  // When the picked equipment changes, clear prior result and try to
  // auto-load anything we have cached. If the cache turns up values, the
  // user sees them immediately — no Claude call required.
  useEffect(() => {
    setResult(null);
    setRunError(null);
    if (!pickedId || !projectId) return;
    let cancelled = false;
    setCacheLoading(true);
    (async () => {
      try {
        const full = await getEquipment(projectId, pickedId);
        const cached = await loadCachedOcrForEquipment(projectId, pickedId);
        if (cancelled) return;
        if (cached?.parsed) {
          setResult({
            parsed: cached.parsed,
            fullEquipment: full,
            attachments: cached.attachments || [],
            usage: null,
            fromCache: true,
            lastUpdated: cached.lastUpdated || null,
            cacheStats: { attachmentsCacheHit: (cached.attachments || []).length, attachmentsCalled: 0 },
          });
        } else {
          // No cache yet — just stash the full equipment so Run OCR is fast.
          setResult({ parsed: null, fullEquipment: full, attachments: [], usage: null, fromCache: false });
        }
      } catch {
        // non-fatal — user can still trigger a run manually
      } finally {
        if (!cancelled) setCacheLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pickedId, projectId]);

  const runOcr = async ({ ignoreCache = false } = {}) => {
    setRunning(true);
    setRunError(null);
    try {
      const full = result?.fullEquipment || await getEquipment(projectId, pickedId);
      const res = await runOcrOnEquipment({
        projectId, userId, equipment: full, fieldSelection, ignoreCache,
      });
      setResult({
        parsed: res.parsed,
        fullEquipment: full,
        attachments: res.attachments,
        usage: res.usage,
        fromCache: false,
        cacheStats: res.cacheStats || null,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      setRunError(e?.message || 'OCR failed');
    } finally {
      setRunning(false);
    }
  };

  const picker = useMemo(() => {
    if (!equipment) return [];
    const q = searchTerm.trim().toLowerCase();
    const filtered = q
      ? equipment.filter(e => (e.tag || '').toLowerCase().includes(q) || String(e.id).includes(q))
      : equipment;
    return filtered.slice(0, 200); // cap to keep render cheap
  }, [equipment, searchTerm]);

  const picked = equipment?.find(e => e.id === pickedId) || null;

  return (
    <Section title="Pick an equipment item">
      {!equipment && !equipmentLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PrimaryButton onClick={onLoadEquipment}>Load equipment list</PrimaryButton>
          <span style={{ fontSize: 12, color: C.textMid }}>Fetches all equipment from FMX (paginated).</span>
        </div>
      )}
      {equipmentLoading && <Hint>Loading equipment…</Hint>}
      {equipmentError && <ErrorBox>{equipmentError}</ErrorBox>}

      {equipment && (
        <>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={`Search ${equipment.length} equipment items by tag or id…`}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8, boxSizing: 'border-box',
            }}
          />
          <div style={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {picker.length === 0 && <div style={{ padding: 12, fontSize: 12, color: C.textMid }}>No matches.</div>}
            {picker.map(item => {
              const isPicked = pickedId === item.id;
              const n = Array.isArray(item.attachmentIDs) ? item.attachmentIDs.length : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => onPick(item.id)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderBottom: `1px solid ${C.border}`,
                    background: isPicked ? C.navyTint : '#fff',
                    border: 'none', borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer', textAlign: 'left', fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 600, color: C.navy, minWidth: 60 }}>#{item.id}</span>
                  <span style={{ flex: 1, color: C.textDark }}>{item.tag || <em style={{ color: C.textLight }}>(no tag)</em>}</span>
                  <span style={{ fontSize: 11, color: n > 0 ? C.okText : C.textLight }}>
                    {n} attach{n === 1 ? '' : 'ments'}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {picked && (
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {result?.fromCache ? (
            <>
              <PrimaryButton
                onClick={() => runOcr({ ignoreCache: false })}
                disabled={running || !fieldSelection.length || !(picked.attachmentIDs?.length)}
              >
                {running ? 'Scanning…' : 'Scan missing fields'}
              </PrimaryButton>
              <MiniButton
                onClick={() => runOcr({ ignoreCache: true })}
                disabled={running || !fieldSelection.length || !(picked.attachmentIDs?.length)}
              >
                Re-scan all
              </MiniButton>
              <CacheBadge lastUpdated={result.lastUpdated} attachmentCount={(result.attachments || []).length} />
            </>
          ) : (
            <PrimaryButton
              onClick={() => runOcr({ ignoreCache: false })}
              disabled={running || !fieldSelection.length || !(picked.attachmentIDs?.length) || cacheLoading}
            >
              {running ? 'Running OCR…' : cacheLoading ? 'Loading…' : `Run OCR on #${picked.id}`}
            </PrimaryButton>
          )}
          {!fieldSelection.length && <Warn>Select at least one field above.</Warn>}
          {!(picked.attachmentIDs?.length) && <Warn>This equipment has no attachments.</Warn>}
        </div>
      )}

      {runError && <ErrorBox>{runError}</ErrorBox>}

      {result && (
        <OcrResultsTable
          projectId={projectId}
          parsed={result.parsed}
          fullEquipment={result.fullEquipment}
          attachments={result.attachments}
          fieldSelection={fieldSelection}
          usage={result.usage}
          onApplied={(updated) => setResult(r => ({ ...r, fullEquipment: updated || r.fullEquipment, applied: true }))}
          applied={result.applied}
        />
      )}
    </Section>
  );
}

// Renders the proposed values Claude returned side-by-side with the current
// FMX values, with per-row accept/edit state and an "Apply to FMX" button
// that merges untouched customFields into the PUT payload.
function OcrResultsTable({ projectId, parsed, fullEquipment, attachments, fieldSelection, usage, onApplied, applied }) {
  const proposed = parsed?.fields || {};
  const existingCustomByKey = new Map();
  for (const cf of fullEquipment?.customFields || []) {
    const k = cf.customFieldID ?? cf.customFieldId ?? cf.id;
    if (k != null) existingCustomByKey.set(String(k), cf);
  }

  const skipped = (attachments || []).filter(a => a.skipped);

  // Per-row accept/value state; seeded from the parsed result.
  const [rowState, setRowState] = useState(() => {
    const seed = proposeAcceptedRows(parsed, fieldSelection);
    const map = {};
    for (const r of seed) map[r.rowId] = r;
    return map;
  });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  const setRow = (rowId, patch) => setRowState(prev => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));

  const acceptedCount = Object.values(rowState).filter(r => r?.accepted).length;

  const apply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const rows = Object.values(rowState).filter(r => r && r.accepted);
      const payload = buildEquipmentPutPayload(fullEquipment, rows);
      const updated = await updateEquipment(projectId, fullEquipment.id, payload);
      onApplied?.(updated?.id ? updated : null);
    } catch (e) {
      setApplyError(e?.message || 'Failed to update equipment');
    } finally {
      setApplying(false);
    }
  };

  const previewable = (attachments || []).filter(a => !a.skipped && a.base64 && a.contentType);

  return (
    <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: '#F9FAFB', fontSize: 12, color: C.textMid, display: 'flex', justifyContent: 'space-between' }}>
        <span>OCR results · {fieldSelection.length} fields</span>
        {usage?.costUsd != null && (
          <span>~${usage.costUsd.toFixed(4)} · {usage.inputTokens}in / {usage.outputTokens}out</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
      <div style={{ flex: previewable.length ? '1 1 55%' : '1 1 100%', minWidth: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#FAFAFA', color: C.navy }}>
            <th style={resTh}>Field</th>
            <th style={resTh}>Current</th>
            <th style={resTh}>Proposed</th>
            <th style={resTh}>Confidence</th>
            <th style={resTh}>Source</th>
          </tr>
        </thead>
        <tbody>
          {fieldSelection.map(f => {
            const cur = f.kind === 'system'
              ? fullEquipment?.[f.key]
              : existingCustomByKey.get(String(f.key))?.value;
            const p = proposed[f.label] || proposed[f.key] || null;
            const row = rowState[f.id] || null;
            const canAccept = !!row; // only rows with a proposed value are editable
            return (
              <tr key={f.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={resTd}>
                  <input
                    type="checkbox"
                    disabled={!canAccept || applied}
                    checked={!!row?.accepted}
                    onChange={e => setRow(f.id, { accepted: e.target.checked })}
                    style={{ marginRight: 8 }}
                  />
                  <strong>{f.label}</strong> <span style={{ color: C.textLight, fontSize: 10 }}>{f.kind}</span>
                </td>
                <td style={resTd}>{renderVal(cur)}</td>
                <td style={resTd}>
                  {canAccept ? (
                    <input
                      type="text"
                      value={row.value ?? ''}
                      onChange={e => setRow(f.id, { value: e.target.value })}
                      disabled={applied}
                      style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 4 }}
                    />
                  ) : renderVal(null)}
                </td>
                <td style={resTd}>{p?.confidence || '—'}</td>
                <td style={resTd}>
                  {p?.source_attachment_id ? `#${p.source_attachment_id}` : '—'}
                  {p?.source_text && <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>"{p.source_text.slice(0, 90)}"</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {previewable.length > 0 && (
        <div style={{ flex: '1 1 45%', minWidth: 0, borderLeft: `1px solid ${C.border}`, background: '#F9FAFB' }}>
          <AttachmentsPreview attachments={previewable} />
        </div>
      )}
      </div>
      {skipped.length > 0 && (
        <div style={{ padding: '8px 12px', background: C.warnBg, borderTop: `1px solid ${C.warnBorder}`, fontSize: 11, color: C.warnText }}>
          Skipped {skipped.length} attachment{skipped.length === 1 ? '' : 's'}: {skipped.map(s => `#${s.id} (${s.reason})`).join(', ')}
        </div>
      )}
      {parsed?.notes && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textMid, fontStyle: 'italic' }}>
          Notes: {parsed.notes}
        </div>
      )}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        {applied ? (
          <span style={{ fontSize: 12, color: C.okText, fontWeight: 600 }}>✓ Updated in FMX</span>
        ) : (
          <>
            <PrimaryButton onClick={apply} disabled={applying || acceptedCount === 0}>
              {applying ? 'Applying…' : `Apply ${acceptedCount} field${acceptedCount === 1 ? '' : 's'} to FMX`}
            </PrimaryButton>
            <span style={{ fontSize: 11, color: C.textMid }}>
              Untouched customFields are preserved on the record.
            </span>
          </>
        )}
        {applyError && <span style={{ fontSize: 11, color: C.errText }}>{applyError}</span>}
      </div>
    </div>
  );
}

// Side-by-side viewer for the attachments Claude just read. Thumbnails along
// the top switch the main viewer below. Images render inline; PDFs go into an
// iframe so the user can page through without leaving the app.
function AttachmentsPreview({ attachments }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const active = attachments[activeIdx] || attachments[0];
  const dataUrl = active ? `data:${active.contentType};base64,${active.base64}` : null;

  if (!active) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 280 }}>
      <div style={{ display: 'flex', gap: 6, padding: 8, overflowX: 'auto', borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
        {attachments.map((a, i) => {
          const isActive = i === activeIdx;
          const thumbSrc = `data:${a.contentType};base64,${a.base64}`;
          const isImg = a.classification === 'image';
          return (
            <button
              key={a.id || i}
              onClick={() => setActiveIdx(i)}
              title={a.filename || `#${a.id}`}
              style={{
                flex: '0 0 auto', width: 56, height: 56, padding: 0,
                border: `2px solid ${isActive ? C.orange : C.border}`,
                borderRadius: 4, cursor: 'pointer', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {isImg
                ? <img src={thumbSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 10, color: C.textMid, fontWeight: 600 }}>PDF</span>}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active.filename || `attachment #${active.id}`} <span style={{ color: C.textLight }}>· {active.classification}</span>
          </span>
          {active.classification === 'image' && (
            <MiniButton onClick={() => setZoomed(z => !z)}>{zoomed ? 'Fit' : 'Zoom'}</MiniButton>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'auto' }}>
          {active.classification === 'image' ? (
            <img
              src={dataUrl}
              alt={active.filename || ''}
              style={zoomed
                ? { maxWidth: 'none', display: 'block' }
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <iframe
              title={active.filename || 'attachment'}
              src={dataUrl}
              style={{ width: '100%', height: '100%', minHeight: 260, border: 'none' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderVal(v) {
  if (v == null || v === '') return <span style={{ color: C.textLight }}>—</span>;
  if (typeof v === 'object') return <code style={{ fontSize: 10 }}>{JSON.stringify(v)}</code>;
  return <span>{String(v)}</span>;
}

const resTh = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${C.border}` };
const resTd = { padding: '8px 10px', verticalAlign: 'top' };

function BatchModePanel({ projectId, userId, equipment, equipmentLoading, equipmentError, onLoadEquipment, fieldSelection }) {
  const eligible = useMemo(() => withAttachments(equipment || []), [equipment]);

  // Per-item state keyed by equipment id: { status, parsed?, fullEquipment?, usage?, attachments?, error?, expanded }
  const [items, setItems] = useState({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Filter + selection state
  const [filters, setFilters] = useState({ buildingId: '', equipmentTypeId: '', tagQuery: '' });
  const [hideOcrd, setHideOcrd] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [ocrdIds, setOcrdIds] = useState(() => new Set());
  const [ocrdLoading, setOcrdLoading] = useState(false);

  // Dependency caches for building / equipment-type name maps.
  const [deps, setDeps] = useState({ buildings: [], equipmentTypes: [] });

  // Load dep caches + previously-OCR'd id set once per project.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const caches = await getAllDependencyCaches(projectId);
      if (cancelled) return;
      const byKey = Object.fromEntries((caches || []).map(r => [r.schema_type, r.extra?.items || []]));
      setDeps({
        buildings: byKey['buildings'] || [],
        equipmentTypes: byKey['equipment-types'] || [],
      });
    })();
    refreshOcrd();
    return () => { cancelled = true; };
  }, [projectId]);

  async function refreshOcrd() {
    if (!projectId) return;
    setOcrdLoading(true);
    // Source of truth is the cache table (equipment_ocr_results), not the
    // audit log. The cache reflects "we have results we can show without
    // re-scanning"; the audit log can include failed runs.
    const ids = await listCachedEquipmentIds(projectId);
    setOcrdIds(ids);
    setOcrdLoading(false);
  }

  const buildingName = useMemo(() => {
    const m = new Map();
    for (const b of deps.buildings) m.set(String(b.id), b.name);
    return m;
  }, [deps.buildings]);
  const equipTypeName = useMemo(() => {
    const m = new Map();
    for (const t of deps.equipmentTypes) m.set(String(t.id), t.name);
    return m;
  }, [deps.equipmentTypes]);

  const visible = useMemo(() => {
    const q = filters.tagQuery.trim().toLowerCase();
    return eligible.filter(e => {
      if (filters.buildingId && String(e.buildingID ?? '') !== filters.buildingId) return false;
      if (filters.equipmentTypeId && String(e.equipmentTypeID ?? '') !== filters.equipmentTypeId) return false;
      if (q && !(e.tag || '').toLowerCase().includes(q) && !String(e.id).includes(q)) return false;
      if (hideOcrd && ocrdIds.has(String(e.id))) return false;
      return true;
    });
  }, [eligible, filters, hideOcrd, ocrdIds]);

  const hiddenOcrdCount = useMemo(
    () => eligible.filter(e => ocrdIds.has(String(e.id))).length,
    [eligible, ocrdIds]
  );

  const updateItem = (id, patch) => setItems(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    const k = String(id);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const selectAllVisible = () => setSelectedIds(prev => {
    const next = new Set(prev);
    for (const e of visible) next.add(String(e.id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const runBatch = async () => {
    const targets = Array.from(selectedIds)
      .map(id => eligible.find(e => String(e.id) === id))
      .filter(Boolean);
    if (!targets.length) return;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    const seed = { ...items };
    for (const e of targets) seed[e.id] = { status: 'pending', expanded: false };
    setItems(seed);

    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      updateItem(e.id, { status: 'running' });
      try {
        const full = await getEquipment(projectId, e.id);
        const res = await runOcrOnEquipment({ projectId, userId, equipment: full, fieldSelection });
        updateItem(e.id, {
          status: 'done',
          parsed: res.parsed,
          fullEquipment: full,
          usage: res.usage,
          attachments: res.attachments,
        });
        setOcrdIds(prev => {
          const next = new Set(prev);
          next.add(String(e.id));
          return next;
        });
      } catch (err) {
        updateItem(e.id, { status: 'error', error: err?.message || 'OCR failed' });
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setRunning(false);
  };

  const toggleExpanded = (id) => updateItem(id, { expanded: !items[id]?.expanded });
  const markApplied = (id, updated) => updateItem(id, { status: 'applied', fullEquipment: updated || items[id]?.fullEquipment });

  const resultIds = Object.keys(items);

  return (
    <Section title="Batch: pick equipment to OCR">
      {!equipment && !equipmentLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PrimaryButton onClick={onLoadEquipment}>Load project equipment</PrimaryButton>
          <span style={{ fontSize: 12, color: C.textMid }}>Fetches all equipment, then filters to those with attachments.</span>
        </div>
      )}
      {equipmentLoading && <Hint>Loading equipment…</Hint>}
      {equipmentError && <ErrorBox>{equipmentError}</ErrorBox>}

      {equipment && (
        <>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>
            {equipment.length} total · <strong style={{ color: C.navy }}>{eligible.length}</strong> with attachments · {visible.length} shown · {selectedIds.size} selected
          </div>

          {/* Filter bar */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            padding: 10, border: `1px solid ${C.border}`, borderRadius: 6,
            background: '#FAFAFA', marginBottom: 10,
          }}>
            <select
              value={filters.buildingId}
              onChange={e => setFilters(f => ({ ...f, buildingId: e.target.value }))}
              style={selectStyle}
              disabled={!deps.buildings.length}
            >
              <option value="">All buildings</option>
              {deps.buildings.map(b => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
            <select
              value={filters.equipmentTypeId}
              onChange={e => setFilters(f => ({ ...f, equipmentTypeId: e.target.value }))}
              style={selectStyle}
              disabled={!deps.equipmentTypes.length}
            >
              <option value="">All equipment types</option>
              {deps.equipmentTypes.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={filters.tagQuery}
              onChange={e => setFilters(f => ({ ...f, tagQuery: e.target.value }))}
              placeholder="Search tag or id…"
              style={{ ...selectStyle, minWidth: 180 }}
            />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.textDark }}>
              <input
                type="checkbox"
                checked={hideOcrd}
                onChange={e => setHideOcrd(e.target.checked)}
              />
              Hide previously OCR'd
              {hiddenOcrdCount > 0 && <span style={{ color: C.textLight }}>({hiddenOcrdCount})</span>}
            </label>
            <MiniButton onClick={refreshOcrd} disabled={ocrdLoading}>
              {ocrdLoading ? 'Refreshing…' : 'Refresh OCR\'d'}
            </MiniButton>
            {(!deps.buildings.length || !deps.equipmentTypes.length) && (
              <span style={{ fontSize: 11, color: C.warnText }}>
                Dependency caches missing — sync Equipment deps from Dependencies tab to enable those filters.
              </span>
            )}
          </div>

          {/* Row list with checkboxes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <MiniButton onClick={selectAllVisible} disabled={!visible.length}>Select all visible</MiniButton>
            <MiniButton onClick={clearSelection} disabled={!selectedIds.size}>Clear selection</MiniButton>
            <span style={{ fontSize: 11, color: C.textMid, marginLeft: 'auto' }}>
              {selectedIds.size} / {visible.length} selected
            </span>
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {visible.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: C.textMid }}>No equipment matches the current filters.</div>
            )}
            {visible.slice(0, 500).map(item => {
              const n = item.attachmentIDs?.length || 0;
              const id = String(item.id);
              const checked = selectedIds.has(id);
              const alreadyOcrd = ocrdIds.has(id);
              const bName = buildingName.get(String(item.buildingID ?? '')) || '';
              const tName = equipTypeName.get(String(item.equipmentTypeID ?? '')) || '';
              return (
                <label
                  key={item.id}
                  style={{
                    display: 'flex', gap: 10, padding: '6px 10px',
                    borderBottom: `1px solid ${C.border}`, fontSize: 12,
                    cursor: 'pointer',
                    background: checked ? C.navyTint : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelected(item.id)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontWeight: 600, color: C.navy, minWidth: 60 }}>#{item.id}</span>
                  <span style={{ flex: 1, color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.tag || <em style={{ color: C.textLight }}>(no tag)</em>}
                  </span>
                  <span style={{ flex: '0 0 140px', color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={bName}>
                    {bName || <span style={{ color: C.textLight }}>—</span>}
                  </span>
                  <span style={{ flex: '0 0 140px', color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tName}>
                    {tName || <span style={{ color: C.textLight }}>—</span>}
                  </span>
                  <span style={{ color: C.okText, minWidth: 28, textAlign: 'right' }}>{n}</span>
                  {alreadyOcrd && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 10,
                      background: C.okBg, color: C.okText, fontWeight: 600,
                    }}>
                      OCR'd
                    </span>
                  )}
                </label>
              );
            })}
            {visible.length > 500 && <div style={{ padding: 10, fontSize: 11, color: C.textMid }}>…{visible.length - 500} more (filter to narrow)</div>}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <PrimaryButton
              onClick={runBatch}
              disabled={running || !fieldSelection.length || selectedIds.size === 0}
            >
              {running
                ? `Running… ${progress.done}/${progress.total}`
                : `Run OCR on ${selectedIds.size} selected`}
            </PrimaryButton>
            {!fieldSelection.length && <Warn>Select at least one field above.</Warn>}
            {selectedIds.size === 0 && <Warn>Check at least one equipment row.</Warn>}
          </div>

          {resultIds.length > 0 && (
            <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {resultIds.map(rid => {
                const e = eligible.find(x => String(x.id) === String(rid));
                if (!e) return null;
                const s = items[e.id] || {};
                return (
                  <div key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: s.expanded ? '#FAFAFA' : '#fff', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: C.navy, minWidth: 60 }}>#{e.id}</span>
                      <span style={{ flex: 1, color: C.textDark }}>{e.tag || <em style={{ color: C.textLight }}>(no tag)</em>}</span>
                      <StatusPill status={s.status} />
                      {s.status === 'done' && s.parsed && (
                        <MiniButton onClick={() => toggleExpanded(e.id)}>{s.expanded ? 'Hide' : 'Review'}</MiniButton>
                      )}
                      {s.status === 'error' && <span style={{ color: C.errText, fontSize: 11 }}>{s.error}</span>}
                    </div>
                    {s.expanded && s.parsed && (
                      <div style={{ padding: 12, background: '#FAFAFA', borderTop: `1px solid ${C.border}` }}>
                        <OcrResultsTable
                          projectId={projectId}
                          parsed={s.parsed}
                          fullEquipment={s.fullEquipment}
                          attachments={s.attachments}
                          fieldSelection={fieldSelection}
                          usage={s.usage}
                          applied={s.status === 'applied'}
                          onApplied={(updated) => markApplied(e.id, updated)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

const selectStyle = {
  fontSize: 12, padding: '6px 8px',
  border: `1px solid ${C.border}`, borderRadius: 4, background: '#fff',
  color: C.textDark,
};

function StatusPill({ status }) {
  const map = {
    pending:  { bg: '#F3F4F6', color: '#6B7280', label: 'queued' },
    running:  { bg: C.blueBg, color: C.navy, label: 'running…' },
    done:     { bg: C.okBg, color: C.okText, label: 'ready' },
    applied:  { bg: C.okBg, color: C.okText, label: '✓ applied' },
    error:    { bg: C.errBg, color: C.errText, label: 'error' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

// ————— field helpers —————

function defaultSuggestions({ systemFields = [], customFields = [] }) {
  const re = /model|serial|manufactur|asset.?tag/i;
  const hits = [];
  for (const sf of systemFields) if (re.test(sf.label || sf.key)) hits.push(`sys:${sf.key}`);
  for (const cf of customFields) if (re.test(cf.name)) hits.push(`cf:${cf.id}`);
  return hits;
}

function buildFieldRows({ systemFields = [], customFields = [] }) {
  const rows = [];
  for (const sf of systemFields) {
    if (sf.isPermitted === false) continue;
    rows.push({ id: `sys:${sf.key}`, key: sf.key, label: sf.label || sf.key, kind: 'system', fieldType: 'system', raw: sf });
  }
  for (const cf of customFields) {
    rows.push({ id: `cf:${cf.id}`, key: cf.id, label: cf.name, kind: 'custom', fieldType: cf.fieldType || 'Text', raw: cf });
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));
  return rows;
}

// ————— shared UI bits —————

function ModeSwitcher({ mode, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {[
        { key: 'single', label: 'Single equipment' },
        { key: 'batch', label: 'Batch (project-wide)' },
      ].map(t => {
        const active = mode === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 500,
              background: active ? C.navy : '#fff',
              color: active ? '#fff' : C.textDark,
              border: 'none', cursor: 'pointer',
            }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        fontSize: 13, padding: '8px 16px', borderRadius: 6,
        background: disabled ? '#E5E7EB' : C.orange, color: disabled ? C.textLight : '#fff',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
      }}
    >{children}</button>
  );
}

function MiniButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        fontSize: 11, padding: '4px 10px', borderRadius: 4,
        background: '#fff', border: `1px solid ${C.border}`,
        color: disabled ? C.textLight : C.textDark,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >{children}</button>
  );
}

function Empty({ children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '32px 28px', color: C.textMid, fontSize: 14 }}>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return <div style={{ fontSize: 12, color: C.textMid, padding: '10px 0' }}>{children}</div>;
}

function Warn({ children }) {
  return <span style={{ fontSize: 12, color: C.warnText }}>{children}</span>;
}

function ErrorBox({ children }) {
  return (
    <div style={{ fontSize: 12, color: C.errText, background: C.errBg, border: `1px solid ${C.errBorder}`, borderRadius: 4, padding: '8px 10px' }}>
      {children}
    </div>
  );
}

function CacheBadge({ lastUpdated, attachmentCount }) {
  const rel = formatRelative(lastUpdated);
  return (
    <span
      title="Loaded from cache. Click 'Scan missing fields' to fill anything new, or 'Re-scan all' to refresh from Claude."
      style={{
        fontSize: 11, padding: '3px 8px', borderRadius: 10,
        background: C.okBg, color: C.okText, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      💾 cached{rel ? ` · ${rel}` : ''}{attachmentCount ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}` : ''}
    </span>
  );
}

function formatRelative(ts) {
  if (!ts) return '';
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

function SubtleCount({ children }) {
  return <span style={{ marginLeft: 8, fontSize: 11, color: C.textMid, fontWeight: 400 }}>{children}</span>;
}
