import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import { fetchPostOptions } from '../fmxSync';
import { listEquipment, withAttachments, getEquipment, runOcrOnEquipment, proposeAcceptedRows, buildEquipmentPutPayload, updateEquipment } from '../equipmentOcr';

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
    fetchPostOptions({ projectId: project.id }, 'Equipment', project.fmx_modules)
      .then(res => {
        if (cancelled) return;
        setFieldCatalog(res);
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

  if (!project.fmx_credentials || !project.fmx_site_url) {
    return (
      <Empty>
        This project has no saved FMX credentials. Save credentials in
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
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: 0 }}>Equipment OCR</h2>
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
  const [result, setResult] = useState(null); // { parsed, fullEquipment, attachments, usage }

  // Reset any prior run when the user picks a different item.
  useEffect(() => { setResult(null); setRunError(null); }, [pickedId]);

  const runOcr = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const full = await getEquipment(projectId, pickedId);
      const res = await runOcrOnEquipment({
        projectId, userId, equipment: full, fieldSelection,
      });
      setResult({ parsed: res.parsed, fullEquipment: full, attachments: res.attachments, usage: res.usage });
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
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <PrimaryButton
            onClick={runOcr}
            disabled={running || !fieldSelection.length || !(picked.attachmentIDs?.length)}
          >
            {running ? 'Running OCR…' : `Run OCR on #${picked.id}`}
          </PrimaryButton>
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

  return (
    <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: '#F9FAFB', fontSize: 12, color: C.textMid, display: 'flex', justifyContent: 'space-between' }}>
        <span>OCR results · {fieldSelection.length} fields</span>
        {usage?.costUsd != null && (
          <span>~${usage.costUsd.toFixed(4)} · {usage.inputTokens}in / {usage.outputTokens}out</span>
        )}
      </div>
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

  const updateItem = (id, patch) => setItems(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const runBatch = async () => {
    if (!eligible.length) return;
    setRunning(true);
    setProgress({ done: 0, total: eligible.length });
    // Seed state
    const seed = {};
    for (const e of eligible) seed[e.id] = { status: 'pending', expanded: false };
    setItems(seed);

    for (let i = 0; i < eligible.length; i++) {
      const e = eligible[i];
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
      } catch (err) {
        updateItem(e.id, { status: 'error', error: err?.message || 'OCR failed' });
      }
      setProgress({ done: i + 1, total: eligible.length });
    }
    setRunning(false);
  };

  const toggleExpanded = (id) => updateItem(id, { expanded: !items[id]?.expanded });
  const markApplied = (id, updated) => updateItem(id, { status: 'applied', fullEquipment: updated || items[id]?.fullEquipment });

  return (
    <Section title="Batch: all equipment with attachments">
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
            {equipment.length} total equipment · <strong style={{ color: C.navy }}>{eligible.length}</strong> with attachments
            {eligible.length > 0 && (
              <> · ~{eligible.reduce((s, e) => s + (e.attachmentIDs?.length || 0), 0)} total attachments</>
            )}
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {eligible.slice(0, 500).map(item => {
              const n = item.attachmentIDs?.length || 0;
              return (
                <div key={item.id} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: C.navy, minWidth: 60 }}>#{item.id}</span>
                  <span style={{ flex: 1, color: C.textDark }}>{item.tag || <em style={{ color: C.textLight }}>(no tag)</em>}</span>
                  <span style={{ color: C.okText }}>{n}</span>
                </div>
              );
            })}
            {eligible.length > 500 && <div style={{ padding: 10, fontSize: 11, color: C.textMid }}>…{eligible.length - 500} more</div>}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <PrimaryButton
              onClick={runBatch}
              disabled={running || !fieldSelection.length || !eligible.length}
            >
              {running ? `Running… ${progress.done}/${progress.total}` : `Run OCR on ${eligible.length} items`}
            </PrimaryButton>
            {!fieldSelection.length && <Warn>Select at least one field above.</Warn>}
          </div>

          {Object.keys(items).length > 0 && (
            <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {eligible.map(e => {
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

function SubtleCount({ children }) {
  return <span style={{ marginLeft: 8, fontSize: 11, color: C.textMid, fontWeight: 400 }}>{children}</span>;
}
