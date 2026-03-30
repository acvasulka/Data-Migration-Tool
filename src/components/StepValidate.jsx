import { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import DepResolveModal from "./DepResolveModal";

const SPIN = `@keyframes _sv_spin { to { transform: rotate(360deg); } }`;
const PAGE_SIZE = 100;

// SVG donut ring — shows % of clean rows
function DonutRing({ cleanPct }) {
  const R = 48, CX = 56, CY = 56, SW = 11;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - cleanPct);
  const pct = Math.round(cleanPct * 100);
  const color = cleanPct === 1 ? C.okText : cleanPct > 0.8 ? C.warnText : C.errText;
  return (
    <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={C.border} strokeWidth={SW} />
      <circle
        cx={CX} cy={CY} r={R} fill="none"
        stroke={C.okText} strokeWidth={SW}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CY})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={CX} y={CY + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// Inline dismissible chip
const FilterChip = ({ label, onRemove }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, padding: '3px 8px 3px 10px', borderRadius: 20,
    background: C.navyTint, color: C.navy, border: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  }}>
    {label}
    <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMid, padding: '0 0 0 2px', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
  </span>
);

export default function StepValidate({
  mappedHeaders,
  mappedRows,
  setMappedRows,
  cellErrors,
  allFields,
  hasErrors,
  certified,
  setCertified,
  applyNLEdit,
  onRowsUpdated,
  projectId,
  schemaType,
  depCacheMap,
  depAutoSyncing,
  onCustomFieldTypeChange,
}) {
  const [jumpIdx, setJumpIdx] = useState(-1);
  const [noMoreMsg, setNoMoreMsg] = useState(false);
  const [focusCell, setFocusCell] = useState(null);
  const [page, setPage] = useState(0);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [nlEditScope, setNlEditScope] = useState('all');
  const [errorColFilter, setErrorColFilter] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Dep modal
  const [depResolveHeader, setDepResolveHeader] = useState(null);
  const [showDepModal, setShowDepModal] = useState(false);

  // Column visibility — persisted to localStorage per schema type
  const [hiddenCols, setHiddenCols] = useState(() => {
    const saved = schemaType ? localStorage.getItem(`sv-cols-${schemaType}`) : null;
    if (saved) { try { return new Set(JSON.parse(saved)); } catch { /* ignore */ } }
    return new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h])));
  });

  const prevSchemaRef = useRef(schemaType);
  useEffect(() => {
    if (prevSchemaRef.current === schemaType) return;
    prevSchemaRef.current = schemaType;
    const saved = schemaType ? localStorage.getItem(`sv-cols-${schemaType}`) : null;
    if (saved) { try { setHiddenCols(new Set(JSON.parse(saved))); return; } catch { /* ignore */ } }
    setHiddenCols(new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h]))));
  }, [schemaType, mappedHeaders, mappedRows]);

  useEffect(() => {
    if (schemaType) localStorage.setItem(`sv-cols-${schemaType}`, JSON.stringify([...hiddenCols]));
  }, [hiddenCols, schemaType]);

  // Dep sync toast
  const prevSyncingRef = useRef(false);
  const [syncDoneToast, setSyncDoneToast] = useState(false);
  useEffect(() => {
    if (prevSyncingRef.current && !depAutoSyncing) {
      setSyncDoneToast(true);
      const t = setTimeout(() => setSyncDoneToast(false), 3000);
      return () => clearTimeout(t);
    }
    prevSyncingRef.current = depAutoSyncing;
  }, [depAutoSyncing]);

  // Auto-fetch bulk-edit suggestions on mount
  useEffect(() => {
    if (Object.keys(cellErrors).length === 0) { setSuggestions([]); return; }
    setSuggestionsLoading(true);
    setSuggestions(null);
    const errColCounts = {};
    for (const [key, val] of Object.entries(cellErrors)) {
      if (val !== 'error') continue;
      const col = key.slice(key.indexOf('-') + 1);
      errColCounts[col] = (errColCounts[col] || 0) + 1;
    }
    const topCols = Object.entries(errColCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([col, n]) => `"${col}": ${n} cells missing`)
      .join('\n');
    const prompt = `You are analyzing data import quality. Generate 2-3 concise, actionable bulk-edit suggestions to fix missing required fields.\n\nSchema type: ${schemaType || 'unknown'}\nTotal rows: ${mappedRows.length}\nFields with missing required data:\n${topCols || '(none)'}\n\nReturn ONLY a JSON array, max 3 items, each with: { "text": "plain English instruction for the bulk edit field", "affectedCount": N }\nInstructions should be copy-pasteable into a bulk edit box. No markdown, no explanation.`;
    fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
      .then(r => r.json())
      .then(data => {
        const raw = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
        setSuggestions(JSON.parse(raw));
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []); // intentional mount-only

  // Error counts across ALL rows
  const errorCount = useMemo(() => Object.values(cellErrors).filter(v => v === "error").length, [cellErrors]);
  const depErrorCount = useMemo(() => Object.values(cellErrors).filter(v => v === "dep_error").length, [cellErrors]);

  // Global row indices with any error
  const errorRowSet = useMemo(() => {
    const s = new Set();
    Object.keys(cellErrors).forEach(k => {
      const dashIdx = k.indexOf('-');
      if (dashIdx > 0) { const ri = parseInt(k.slice(0, dashIdx), 10); if (!isNaN(ri)) s.add(ri); }
    });
    return s;
  }, [cellErrors]);

  // Errors by column (top 6, sorted descending)
  const errorsByColumn = useMemo(() => {
    const counts = {};
    for (const [key, val] of Object.entries(cellErrors)) {
      if (val !== 'error' && val !== 'dep_error') continue;
      const col = key.slice(key.indexOf('-') + 1);
      counts[col] = (counts[col] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [cellErrors]);

  // Donut values
  const totalRows = mappedRows.length;
  const cleanRows = totalRows - errorRowSet.size;
  const cleanPct = totalRows > 0 ? cleanRows / totalRows : 1;

  // Unique values per column
  const colUniqueValues = useMemo(() => {
    const map = {};
    for (const h of mappedHeaders) {
      const vals = new Set(); let hasBlank = false;
      for (const row of mappedRows) { const v = row[h] ?? ''; if (v) vals.add(v); else hasBlank = true; }
      const sorted = [...vals].sort((a, b) => a.localeCompare(b));
      map[h] = hasBlank ? ['(blank)', ...sorted] : sorted;
    }
    return map;
  }, [mappedRows, mappedHeaders]);

  // Active rows: all filters combined
  const [activeRows, activeGlobalIndices] = useMemo(() => {
    let pairs = mappedRows.map((r, i) => ({ r, i }));
    if (showOnlyErrors) pairs = pairs.filter(({ i }) => errorRowSet.has(i));
    if (errorColFilter) pairs = pairs.filter(({ i }) => cellErrors[`${i}-${errorColFilter}`] !== undefined);
    if (globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase();
      pairs = pairs.filter(({ r }) => Object.values(r).some(v => (v || '').toLowerCase().includes(q)));
    }
    for (const [col, vals] of Object.entries(columnFilters)) {
      if (!vals || vals.length === 0) continue;
      const valSet = new Set(vals);
      const hasBlank = valSet.has('(blank)');
      pairs = pairs.filter(({ r }) => { const v = r[col] ?? ''; return v ? valSet.has(v) : hasBlank; });
    }
    return [pairs.map(({ r }) => r), pairs.map(({ i }) => i)];
  }, [mappedRows, showOnlyErrors, errorRowSet, errorColFilter, globalSearch, columnFilters, cellErrors]);

  const hasActiveFilters = !!globalSearch.trim() || showOnlyErrors || !!errorColFilter ||
    Object.values(columnFilters).some(v => v && v.length > 0);

  const clearAllFilters = () => {
    setGlobalSearch(''); setColumnFilters({}); setShowOnlyErrors(false); setErrorColFilter(null); setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(() => activeRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE), [activeRows, clampedPage]);
  const pageGlobalIndices = useMemo(() => activeGlobalIndices.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE), [activeGlobalIndices, clampedPage]);
  const visibleHeaders = useMemo(() => mappedHeaders.filter(h => !hiddenCols.has(h)), [mappedHeaders, hiddenCols]);

  useEffect(() => { setPage(0); }, [showOnlyErrors, globalSearch, columnFilters, errorColFilter]);

  // Sorted hard-error cells for jump-to
  const errorCells = useMemo(() => {
    return Object.entries(cellErrors)
      .filter(([, v]) => v === "error")
      .map(([key]) => { const d = key.indexOf("-"); return { ri: parseInt(key.slice(0, d), 10), header: key.slice(d + 1) }; })
      .sort((a, b) => a.ri !== b.ri ? a.ri - b.ri : mappedHeaders.indexOf(a.header) - mappedHeaders.indexOf(b.header));
  }, [cellErrors, mappedHeaders]);

  const jumpToNextError = () => {
    if (errorCells.length === 0) return;
    const next = jumpIdx + 1;
    if (next >= errorCells.length) {
      setNoMoreMsg(true); setTimeout(() => setNoMoreMsg(false), 2000); setJumpIdx(-1); return;
    }
    setJumpIdx(next);
    const { ri: globalRi, header } = errorCells[next];
    const localRi = activeGlobalIndices.indexOf(globalRi);
    if (localRi >= 0) { setPage(Math.floor(localRi / PAGE_SIZE)); }
    else { setShowOnlyErrors(false); setGlobalSearch(''); setColumnFilters({}); setErrorColFilter(null); setPage(Math.floor(globalRi / PAGE_SIZE)); }
    setFocusCell({ ri: globalRi, header, _t: Date.now() });
  };

  const hasCacheData = Object.keys(depCacheMap || {}).length > 0;

  const handleDepColumnClick = (header) => { setDepResolveHeader(header === '__all__' ? null : header); setShowDepModal(true); };
  const handleFixAll = () => { setDepResolveHeader(null); setShowDepModal(true); };

  // NL Edit — snapshot for undo, then apply
  const handleNLEditApply = (field, code) => {
    setUndoSnapshot([...mappedRows]);
    if (nlEditScope === 'filtered' && activeGlobalIndices.length < mappedRows.length) {
      setMappedRows(prev => {
        const next = [...prev];
        const fn = new Function('row', code);
        activeGlobalIndices.forEach(gi => { try { next[gi] = { ...next[gi], [field]: fn(next[gi]) }; } catch { /* skip */ } });
        if (onRowsUpdated) onRowsUpdated(next);
        return next;
      });
    } else {
      applyNLEdit(field, code);
    }
  };

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setMappedRows(undoSnapshot);
    if (onRowsUpdated) onRowsUpdated(undoSnapshot);
    setUndoSnapshot(null);
  };

  const handlePageChange = (updatedPageRows) => {
    setMappedRows(prev => {
      const next = [...prev];
      pageGlobalIndices.forEach((gi, li) => { next[gi] = updatedPageRows[li]; });
      if (onRowsUpdated) onRowsUpdated(next);
      return next;
    });
  };

  const handleRowRemove = (localRi) => {
    const globalRi = pageGlobalIndices[localRi];
    setMappedRows(prev => prev.filter((_, i) => i !== globalRi));
  };

  const handleRowAdd = () => {
    setMappedRows(prev => [...prev, Object.fromEntries(mappedHeaders.map(h => [h, ""]))]);
  };

  const handleApplyDepReplacements = (replacementsByField) => {
    setMappedRows(rows => rows.map(row => {
      const newRow = { ...row };
      for (const [fieldName, reps] of Object.entries(replacementsByField)) {
        const curr = row[fieldName];
        if (curr && reps[curr] !== undefined) newRow[fieldName] = reps[curr];
      }
      return newRow;
    }));
  };

  const handleColumnFilterChange = (col, values) => {
    setColumnFilters(prev => {
      if (values.length === 0) { const next = { ...prev }; delete next[col]; return next; }
      return { ...prev, [col]: values };
    });
    setPage(0);
  };

  const pageStart = clampedPage * PAGE_SIZE + 1;
  const pageEnd = Math.min((clampedPage + 1) * PAGE_SIZE, activeRows.length);
  const hiddenRowCount = mappedRows.length - activeRows.length;

  return (
    <div>
      <style>{SPIN}</style>

      {/* ── No-cache banner ── */}
      {!hasCacheData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', marginBottom: 14, background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 8, fontSize: 12, color: C.warnText }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>⚠</span>
          <span><strong>Dependency validation is inactive.</strong> Go to the <strong>Dependencies tab</strong> and click <strong>Update Dependencies</strong> to validate cross-field references against live FMX data.</span>
        </div>
      )}

      {/* ── Two-panel header: Bulk Edit (left 40%) + Data Quality (right 40%) ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'stretch', justifyContent: 'center' }}>

        {/* Left: NLEditPanel — 40% */}
        <div style={{ width: '40%', flexShrink: 0, minWidth: 0 }}>
          <NLEditPanel
            headers={mappedHeaders}
            onApply={handleNLEditApply}
            updateScope={nlEditScope}
            onToggleScope={() => setNlEditScope(s => s === 'all' ? 'filtered' : 'all')}
            filteredCount={activeRows.length}
            totalCount={mappedRows.length}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            canUndo={!!undoSnapshot}
            onUndo={handleUndo}
          />
        </div>

        {/* Right: Data Quality panel — 40% */}
        <div style={{ width: '40%', flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', background: C.white, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Data Quality</p>

          {/* Donut ring + counts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <DonutRing cleanPct={cleanPct} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.textDark }}>{cleanRows}</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: C.textMid, marginLeft: 5 }}>of {totalRows} rows clean</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ padding: '4px 10px', borderRadius: 6, background: errorCount > 0 ? C.errBg : C.okBg, border: `1px solid ${errorCount > 0 ? C.errBorder : C.okBorder}` }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: errorCount > 0 ? C.errText : C.okText }}>{errorCount}</span>
                  <span style={{ fontSize: 10, color: errorCount > 0 ? C.errText : C.okText, marginLeft: 5 }}>missing required</span>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: 6, background: depErrorCount > 0 ? C.warnBg : C.okBg, border: `1px solid ${depErrorCount > 0 ? C.warnBorder : C.okBorder}` }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: depErrorCount > 0 ? C.warnText : C.okText }}>{depErrorCount}</span>
                  <span style={{ fontSize: 10, color: depErrorCount > 0 ? C.warnText : C.okText, marginLeft: 5 }}>dep mismatches</span>
                </div>
              </div>
            </div>
          </div>

          {/* Error navigation buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`fmx-btn-xs-rule${showOnlyErrors ? ' active' : ''}`}
              onClick={() => setShowOnlyErrors(v => !v)}
              disabled={errorRowSet.size === 0}
              style={{ opacity: errorRowSet.size === 0 ? 0.5 : 1 }}
            >
              {showOnlyErrors ? '✓ Error rows only' : 'Show error rows'}
            </button>
            <button
              className="fmx-btn-xs"
              onClick={jumpToNextError}
              disabled={errorCells.length === 0}
              style={{ color: errorCells.length > 0 ? C.errText : undefined, borderColor: errorCells.length > 0 ? C.errBorder : undefined, background: errorCells.length > 0 ? C.errBg : undefined }}
            >
              Jump to error ↓
            </button>
            {noMoreMsg && <span style={{ fontSize: 11, color: C.textMid, fontStyle: 'italic' }}>No more errors</span>}
          </div>

          {/* Errors by column */}
          {errorsByColumn.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Errors by column
              </p>
              {errorsByColumn.map(([col, count]) => {
                const isActive = errorColFilter === col;
                return (
                  <button
                    key={col}
                    onClick={() => { setErrorColFilter(isActive ? null : col); setPage(0); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '5px 8px 5px 10px', marginBottom: 3, borderRadius: 6,
                      border: `1px solid ${isActive ? C.warnBorder : 'transparent'}`,
                      borderLeft: `3px solid ${isActive ? C.warnText : C.errText}`,
                      cursor: 'pointer', textAlign: 'left',
                      background: isActive ? C.warnBg : C.errBg,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#FFDDD4'; e.currentTarget.style.borderColor = C.errBorder; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = C.errBg; e.currentTarget.style.borderColor = 'transparent'; } }}
                  >
                    <span style={{ fontSize: 11, color: isActive ? C.warnText : C.errText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: isActive ? 600 : 400 }}>
                      {isActive ? '▶ ' : ''}{col}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, flexShrink: 0, background: isActive ? C.warnText : C.errText, color: C.white }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Action buttons: Fix dep issues */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {depErrorCount > 0 && (
              <button className="fmx-btn-xs" onClick={handleFixAll} style={{ color: C.warnText, borderColor: C.warnBorder, background: C.warnBg, fontWeight: 600 }}>
                ⚠ Fix {depErrorCount} dep issue{depErrorCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Dep sync status + toast */}
          {(depAutoSyncing || syncDoneToast) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
              {depAutoSyncing && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMid }}>
                  <div style={{ width: 10, height: 10, border: `2px solid ${C.border}`, borderTopColor: C.orange, borderRadius: '50%', animation: '_sv_spin 0.8s linear infinite', flexShrink: 0 }} />
                  Refreshing dependencies…
                </span>
              )}
              {syncDoneToast && !depAutoSyncing && (
                <span style={{ fontSize: 11, color: C.okText, fontWeight: 600 }}>✓ Dependencies updated</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Row above search: Columns dropdown + hidden counts ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>

        {/* Columns dropdown */}
        <div style={{ position: 'relative' }}>
          <button className="fmx-btn-xs" onClick={() => setColMenuOpen(v => !v)}>Columns ▾</button>
          {colMenuOpen && (
            <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 0', zIndex: 100, minWidth: 210, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.11)' }}>
              <div style={{ padding: '4px 14px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setHiddenCols(new Set())} style={{ fontSize: 11, color: C.navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Show all</button>
                <button onClick={() => setHiddenCols(new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h]))))} style={{ fontSize: 11, color: C.textMid, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reset defaults</button>
              </div>
              {mappedHeaders.map(h => (
                <label key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.textDark }}>
                  <input type="checkbox" checked={!hiddenCols.has(h)} onChange={e => { setHiddenCols(prev => { const next = new Set(prev); e.target.checked ? next.delete(h) : next.add(h); return next; }); }} />
                  {h}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Hidden columns count */}
        {hiddenCols.size > 0 && (
          <span style={{ fontSize: 11, color: C.textMid }}>
            {hiddenCols.size} column{hiddenCols.size !== 1 ? 's' : ''} hidden
          </span>
        )}

        {/* Separator dot — only when both labels shown */}
        {hiddenCols.size > 0 && hiddenRowCount > 0 && (
          <span style={{ fontSize: 11, color: C.textLight }}>·</span>
        )}

        {/* Hidden rows count */}
        {hiddenRowCount > 0 && (
          <span style={{ fontSize: 11, color: C.textMid }}>
            {hiddenRowCount} row{hiddenRowCount !== 1 ? 's' : ''} hidden
          </span>
        )}
      </div>

      {/* ── Global search bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textLight, fontSize: 15, pointerEvents: 'none', lineHeight: 1 }}>⌕</span>
          <input className="fmx-input" style={{ width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} placeholder="Search all columns…" value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setPage(0); }} />
        </div>
        {hasActiveFilters && <button className="fmx-btn-xs" onClick={clearAllFilters} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Clear all filters</button>}
        <span style={{ fontSize: 12, color: C.textMid, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {activeRows.length === mappedRows.length ? `${mappedRows.length} row${mappedRows.length !== 1 ? 's' : ''}` : `${activeRows.length} of ${mappedRows.length} rows`}
        </span>
      </div>

      {/* ── Filter chip bar ── */}
      {hasActiveFilters && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {globalSearch.trim() && <FilterChip label={`Search: "${globalSearch}"`} onRemove={() => setGlobalSearch('')} />}
          {showOnlyErrors && <FilterChip label="Errors only" onRemove={() => setShowOnlyErrors(false)} />}
          {errorColFilter && <FilterChip label={`Errors in: ${errorColFilter}`} onRemove={() => setErrorColFilter(null)} />}
          {Object.entries(columnFilters).map(([col, vals]) =>
            vals && vals.length > 0 ? (
              <FilterChip key={col} label={`${col}: ${vals.length === 1 ? vals[0] : `${vals.length} selected`}`} onRemove={() => handleColumnFilterChange(col, [])} />
            ) : null
          )}
        </div>
      )}

      {/* ── Spreadsheet ── */}
      <ValidationSpreadsheet
        headers={visibleHeaders}
        rows={pageRows}
        rowGlobalIndices={pageGlobalIndices}
        cellErrors={cellErrors}
        allFields={allFields}
        focusCell={focusCell}
        onDepColumnClick={handleDepColumnClick}
        onChange={handlePageChange}
        onRowRemove={handleRowRemove}
        onRowAdd={handleRowAdd}
        columnFilters={columnFilters}
        onColumnFilterChange={handleColumnFilterChange}
        colUniqueValues={colUniqueValues}
        onCustomFieldTypeChange={onCustomFieldTypeChange}
      />

      {/* ── Pagination controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {totalPages > 1 && (
          <>
            <button className="fmx-btn-xs" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={clampedPage === 0}>← Prev</button>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.textDark }}>Page {clampedPage + 1} of {totalPages}</span>
            <button className="fmx-btn-xs" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={clampedPage === totalPages - 1}>Next →</button>
            <span style={{ fontSize: 12, color: C.textLight }}>rows {pageStart}–{pageEnd} of {activeRows.length}{hasActiveFilters ? ' filtered' : ''}</span>
          </>
        )}
        {activeRows.length === 0 && hasActiveFilters && (
          <span style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic' }}>
            No rows match current filters —{' '}
            <button onClick={clearAllFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, fontSize: 12, padding: 0, textDecoration: 'underline' }}>clear filters</button>
          </span>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{ marginTop: '1rem' }}>
        {hasErrors && (
          <div style={{ padding: '12px 14px', background: C.errBg, border: `1px solid ${C.errBorder}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: C.errText }}>There are cells with errors.</p>
              <p style={{ margin: 0, fontSize: 12, color: C.errText, opacity: 0.85 }}>Fix them above, or certify below to proceed anyway.</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, color: C.errText, fontWeight: 500, flexShrink: 0 }}>
              <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} style={{ width: 15, height: 15 }} />
              Proceed anyway
            </label>
          </div>
        )}
        {!hasErrors && (
          <div style={{ padding: '12px 14px', background: C.okBg, border: `1px solid ${C.okBorder}`, borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.okText }}>
              ✓ No errors — all required fields are filled.
              {depErrorCount > 0 && <span style={{ color: C.warnText, fontWeight: 400, marginLeft: 8 }}>({depErrorCount} dependency mismatch{depErrorCount !== 1 ? 'es' : ''} — review or fix above)</span>}
            </p>
          </div>
        )}
      </div>

      {/* ── Dep Resolve Modal ── */}
      {showDepModal && (
        <DepResolveModal
          targetHeader={depResolveHeader}
          rows={mappedRows}
          cellErrors={cellErrors}
          allFields={allFields}
          depCacheMap={depCacheMap}
          onApply={handleApplyDepReplacements}
          onClose={() => setShowDepModal(false)}
        />
      )}
    </div>
  );
}
