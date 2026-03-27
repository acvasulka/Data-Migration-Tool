import { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import DepResolveModal from "./DepResolveModal";

const SPIN = `@keyframes _sv_spin { to { transform: rotate(360deg); } }`;
const PAGE_SIZE = 100;

// Inline dismissible chip for active filters
const FilterChip = ({ label, onRemove }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, padding: '3px 8px 3px 10px', borderRadius: 20,
    background: C.navyTint, color: C.navy,
    border: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  }}>
    {label}
    <button
      onClick={onRemove}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMid, padding: '0 0 0 2px', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center' }}
    >
      ×
    </button>
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
  depCacheMap,      // { [crossSheetType]: string[] }
  depAutoSyncing,   // bool — background dep sync in progress
}) {
  const [jumpIdx, setJumpIdx] = useState(-1);
  const [noMoreMsg, setNoMoreMsg] = useState(false);
  const [focusCell, setFocusCell] = useState(null);
  const [page, setPage] = useState(0);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({});  // { [col]: string[] }
  const [nlEditScope, setNlEditScope] = useState('all');   // 'all' | 'filtered'

  // Dep modal state
  const [depResolveHeader, setDepResolveHeader] = useState(null);
  const [showDepModal, setShowDepModal] = useState(false);

  // Column visibility — persisted to localStorage per schema type
  const [hiddenCols, setHiddenCols] = useState(() => {
    const saved = schemaType ? localStorage.getItem(`sv-cols-${schemaType}`) : null;
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch { /* ignore */ }
    }
    return new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h])));
  });

  // Re-initialize hidden cols on schema type change
  const prevSchemaRef = useRef(schemaType);
  useEffect(() => {
    if (prevSchemaRef.current === schemaType) return;
    prevSchemaRef.current = schemaType;
    const saved = schemaType ? localStorage.getItem(`sv-cols-${schemaType}`) : null;
    if (saved) {
      try { setHiddenCols(new Set(JSON.parse(saved))); return; } catch { /* ignore */ }
    }
    setHiddenCols(new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h]))));
  }, [schemaType, mappedHeaders, mappedRows]);

  // Persist column visibility
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

  // Error counts across ALL rows
  const errorCount = useMemo(
    () => Object.values(cellErrors).filter(v => v === "error").length,
    [cellErrors]
  );
  const depErrorCount = useMemo(
    () => Object.values(cellErrors).filter(v => v === "dep_error").length,
    [cellErrors]
  );

  // Global row indices with any error
  const errorRowSet = useMemo(() => {
    const s = new Set();
    Object.keys(cellErrors).forEach(k => {
      const dashIdx = k.indexOf('-');
      if (dashIdx > 0) {
        const ri = parseInt(k.slice(0, dashIdx), 10);
        if (!isNaN(ri)) s.add(ri);
      }
    });
    return s;
  }, [cellErrors]);

  // Unique values per column — computed from full dataset for filter dropdowns
  const colUniqueValues = useMemo(() => {
    const map = {};
    for (const h of mappedHeaders) {
      const vals = new Set();
      let hasBlank = false;
      for (const row of mappedRows) {
        const v = row[h] ?? '';
        if (v) vals.add(v); else hasBlank = true;
      }
      const sorted = [...vals].sort((a, b) => a.localeCompare(b));
      map[h] = hasBlank ? ['(blank)', ...sorted] : sorted;
    }
    return map;
  }, [mappedRows, mappedHeaders]);

  // Active rows: apply all filters (errors, global search, column filters)
  const [activeRows, activeGlobalIndices] = useMemo(() => {
    let pairs = mappedRows.map((r, i) => ({ r, i }));

    if (showOnlyErrors) {
      pairs = pairs.filter(({ i }) => errorRowSet.has(i));
    }
    if (globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase();
      pairs = pairs.filter(({ r }) => Object.values(r).some(v => (v || '').toLowerCase().includes(q)));
    }
    for (const [col, vals] of Object.entries(columnFilters)) {
      if (!vals || vals.length === 0) continue;
      const valSet = new Set(vals);
      const hasBlank = valSet.has('(blank)');
      pairs = pairs.filter(({ r }) => {
        const v = r[col] ?? '';
        return v ? valSet.has(v) : hasBlank;
      });
    }

    return [pairs.map(({ r }) => r), pairs.map(({ i }) => i)];
  }, [mappedRows, showOnlyErrors, errorRowSet, globalSearch, columnFilters]);

  const hasActiveFilters = !!globalSearch.trim() || showOnlyErrors ||
    Object.values(columnFilters).some(v => v && v.length > 0);

  const clearAllFilters = () => {
    setGlobalSearch('');
    setColumnFilters({});
    setShowOnlyErrors(false);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(
    () => activeRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [activeRows, clampedPage]
  );
  const pageGlobalIndices = useMemo(
    () => activeGlobalIndices.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [activeGlobalIndices, clampedPage]
  );

  const visibleHeaders = useMemo(
    () => mappedHeaders.filter(h => !hiddenCols.has(h)),
    [mappedHeaders, hiddenCols]
  );

  // Reset page on filter changes
  useEffect(() => { setPage(0); }, [showOnlyErrors, globalSearch, columnFilters]);

  // Sorted hard-error cells for jump-to
  const errorCells = useMemo(() => {
    return Object.entries(cellErrors)
      .filter(([, v]) => v === "error")
      .map(([key]) => {
        const dashIdx = key.indexOf("-");
        return { ri: parseInt(key.slice(0, dashIdx), 10), header: key.slice(dashIdx + 1) };
      })
      .sort((a, b) => a.ri !== b.ri ? a.ri - b.ri : mappedHeaders.indexOf(a.header) - mappedHeaders.indexOf(b.header));
  }, [cellErrors, mappedHeaders]);

  const jumpToNextError = () => {
    if (errorCells.length === 0) return;
    const next = jumpIdx + 1;
    if (next >= errorCells.length) {
      setNoMoreMsg(true);
      setTimeout(() => setNoMoreMsg(false), 2000);
      setJumpIdx(-1);
      return;
    }
    setJumpIdx(next);
    const { ri: globalRi, header } = errorCells[next];
    const localRi = activeGlobalIndices.indexOf(globalRi);
    if (localRi >= 0) {
      setPage(Math.floor(localRi / PAGE_SIZE));
    } else {
      // Error row not in current filtered view — clear filters to reveal it
      setShowOnlyErrors(false);
      setGlobalSearch('');
      setColumnFilters({});
      setPage(Math.floor(globalRi / PAGE_SIZE));
    }
    setFocusCell({ ri: globalRi, header, _t: Date.now() });
  };

  const hasCacheData = Object.keys(depCacheMap || {}).length > 0;

  const handleDepColumnClick = (header) => {
    setDepResolveHeader(header === '__all__' ? null : header);
    setShowDepModal(true);
  };

  const handleFixAll = () => {
    setDepResolveHeader(null);
    setShowDepModal(true);
  };

  // NL Edit apply — respects scope (all vs filtered)
  const handleNLEditApply = (field, code) => {
    if (nlEditScope === 'filtered' && activeGlobalIndices.length < mappedRows.length) {
      setMappedRows(prev => {
        const next = [...prev];
        const fn = new Function('row', code);
        activeGlobalIndices.forEach(gi => {
          try { next[gi] = { ...next[gi], [field]: fn(next[gi]) }; } catch { /* skip bad rows */ }
        });
        if (onRowsUpdated) onRowsUpdated(next);
        return next;
      });
    } else {
      applyNLEdit(field, code);
    }
  };

  // Merge updated page rows back into full mappedRows
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
      if (values.length === 0) {
        const next = { ...prev };
        delete next[col];
        return next;
      }
      return { ...prev, [col]: values };
    });
    setPage(0);
  };

  const pageStart = clampedPage * PAGE_SIZE + 1;
  const pageEnd = Math.min((clampedPage + 1) * PAGE_SIZE, activeRows.length);

  return (
    <div>
      <style>{SPIN}</style>

      {/* ── No-cache banner ── */}
      {!hasCacheData && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', marginBottom: 14,
          background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 8,
          fontSize: 12, color: C.warnText,
        }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>⚠</span>
          <span>
            <strong>Dependency validation is inactive.</strong> Go to the{' '}
            <strong>Dependencies tab</strong> and click <strong>Update Dependencies</strong>{' '}
            to validate cross-field references against live FMX data.
          </span>
        </div>
      )}

      {/* ── Two-panel header: Bulk Edit (left) + Data Quality (right) ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'stretch' }}>

        {/* Left: NLEditPanel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <NLEditPanel
            headers={mappedHeaders}
            onApply={handleNLEditApply}
            updateScope={nlEditScope}
            onToggleScope={() => setNlEditScope(s => s === 'all' ? 'filtered' : 'all')}
            filteredCount={activeRows.length}
            totalCount={mappedRows.length}
          />
        </div>

        {/* Right: Data Quality panel */}
        <div style={{
          width: '42%', flexShrink: 0,
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 16px', background: C.white,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Data Quality</p>

          {/* Counts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: errorCount > 0 ? C.errText : C.okText }} />
              <span style={{ fontSize: 12, color: errorCount > 0 ? C.errText : C.okText }}>
                {errorCount} cell{errorCount !== 1 ? 's' : ''} with missing required data
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: depErrorCount > 0 ? C.warnText : C.okText }} />
              <span style={{ fontSize: 12, color: depErrorCount > 0 ? C.warnText : C.okText }}>
                {depErrorCount} dependency mismatch{depErrorCount !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Show only error rows */}
            <button
              className={`fmx-btn-xs-rule${showOnlyErrors ? ' active' : ''}`}
              onClick={() => setShowOnlyErrors(v => !v)}
              disabled={errorRowSet.size === 0}
              title={errorRowSet.size === 0 ? 'No rows with errors' : undefined}
              style={{ opacity: errorRowSet.size === 0 ? 0.5 : 1 }}
            >
              {showOnlyErrors ? '✓ Error rows only' : 'Show error rows'}
            </button>

            {/* Jump to hard error */}
            <button
              className="fmx-btn-xs"
              onClick={jumpToNextError}
              disabled={errorCells.length === 0}
              style={{
                color: errorCells.length > 0 ? C.errText : undefined,
                borderColor: errorCells.length > 0 ? C.errBorder : undefined,
                background: errorCells.length > 0 ? C.errBg : undefined,
              }}
            >
              Jump to error ↓
            </button>

            {/* Fix dep issues */}
            {depErrorCount > 0 && (
              <button
                className="fmx-btn-xs"
                onClick={handleFixAll}
                style={{ color: C.warnText, borderColor: C.warnBorder, background: C.warnBg, fontWeight: 600 }}
              >
                ⚠ Fix {depErrorCount} dep issue{depErrorCount !== 1 ? 's' : ''}
              </button>
            )}

            {/* Column visibility */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button className="fmx-btn-xs" onClick={() => setColMenuOpen(v => !v)}>
                Columns ▾
              </button>
              {colMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '6px 0', zIndex: 100, minWidth: 210, maxHeight: 320,
                  overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.11)',
                }}>
                  <div style={{ padding: '4px 14px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <button
                      onClick={() => setHiddenCols(new Set())}
                      style={{ fontSize: 11, color: C.navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      Show all
                    </button>
                    <button
                      onClick={() => setHiddenCols(new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h]))))}
                      style={{ fontSize: 11, color: C.textMid, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Reset defaults
                    </button>
                  </div>
                  {mappedHeaders.map(h => (
                    <label key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.textDark }}>
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(h)}
                        onChange={e => {
                          setHiddenCols(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.delete(h) : next.add(h);
                            return next;
                          });
                        }}
                      />
                      {h}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dep sync status + toast + no-more message */}
          {(depAutoSyncing || syncDoneToast || noMoreMsg) && (
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
              {noMoreMsg && (
                <span style={{ fontSize: 11, color: C.textMid, fontStyle: 'italic' }}>No more errors</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Global search bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textLight, fontSize: 15, pointerEvents: 'none', lineHeight: 1 }}>⌕</span>
          <input
            className="fmx-input"
            style={{ width: '100%', paddingLeft: 30, boxSizing: 'border-box' }}
            placeholder="Search all columns…"
            value={globalSearch}
            onChange={e => { setGlobalSearch(e.target.value); setPage(0); }}
          />
        </div>
        {hasActiveFilters && (
          <button className="fmx-btn-xs" onClick={clearAllFilters} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            Clear all filters
          </button>
        )}
        <span style={{ fontSize: 12, color: C.textMid, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {activeRows.length === mappedRows.length
            ? `${mappedRows.length} row${mappedRows.length !== 1 ? 's' : ''}`
            : `${activeRows.length} of ${mappedRows.length} rows`}
        </span>
      </div>

      {/* ── Active filter chip bar ── */}
      {hasActiveFilters && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {globalSearch.trim() && (
            <FilterChip label={`Search: "${globalSearch}"`} onRemove={() => setGlobalSearch('')} />
          )}
          {showOnlyErrors && (
            <FilterChip label="Errors only" onRemove={() => setShowOnlyErrors(false)} />
          )}
          {Object.entries(columnFilters).map(([col, vals]) =>
            vals && vals.length > 0 ? (
              <FilterChip
                key={col}
                label={`${col}: ${vals.length === 1 ? vals[0] : `${vals.length} selected`}`}
                onRemove={() => handleColumnFilterChange(col, [])}
              />
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
      />

      {/* ── Pagination controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {totalPages > 1 && (
          <>
            <button
              className="fmx-btn-xs"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.textDark }}>
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              className="fmx-btn-xs"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage === totalPages - 1}
            >
              Next →
            </button>
            <span style={{ fontSize: 12, color: C.textLight }}>
              rows {pageStart}–{pageEnd} of {activeRows.length}{hasActiveFilters ? ' filtered' : ''}
            </span>
          </>
        )}
        {activeRows.length === 0 && hasActiveFilters && (
          <span style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic' }}>
            No rows match current filters —{' '}
            <button onClick={clearAllFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, fontSize: 12, padding: 0, textDecoration: 'underline' }}>
              clear filters
            </button>
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
              {depErrorCount > 0 && (
                <span style={{ color: C.warnText, fontWeight: 400, marginLeft: 8 }}>
                  ({depErrorCount} dependency mismatch{depErrorCount !== 1 ? 'es' : ''} — review or fix above)
                </span>
              )}
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
