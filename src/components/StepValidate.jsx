import { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import DepResolveModal from "./DepResolveModal";

const SPIN = `@keyframes _sv_spin { to { transform: rotate(360deg); } }`;
const PAGE_SIZE = 100;

const pagerBtnStyle = (disabled) => ({
  fontSize: 12,
  padding: "5px 12px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: disabled ? C.bgPage : C.white,
  color: disabled ? C.textLight : C.textDark,
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 500,
});

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

  // Which dep field to resolve (column header string) — null means "all"
  const [depResolveHeader, setDepResolveHeader] = useState(null);
  const [showDepModal, setShowDepModal] = useState(false);

  // Column visibility — persisted to localStorage per schema type
  const [hiddenCols, setHiddenCols] = useState(() => {
    const saved = schemaType ? localStorage.getItem(`sv-cols-${schemaType}`) : null;
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch { /* ignore */ }
    }
    // Default: hide columns where no row has any data
    return new Set(mappedHeaders.filter(h => !mappedRows.some(r => r[h])));
  });

  // Re-initialize hidden cols when schema type changes (navigating between wizards)
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

  // Persist column visibility choices
  useEffect(() => {
    if (schemaType) {
      localStorage.setItem(`sv-cols-${schemaType}`, JSON.stringify([...hiddenCols]));
    }
  }, [hiddenCols, schemaType]);

  // Toast: detect when depAutoSyncing transitions false → show "Updated ✓"
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

  // Count error types across ALL rows
  const errorCount = useMemo(
    () => Object.values(cellErrors).filter(v => v === "error").length,
    [cellErrors]
  );
  const depErrorCount = useMemo(
    () => Object.values(cellErrors).filter(v => v === "dep_error").length,
    [cellErrors]
  );

  // Global row indices that have any error (red or yellow)
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

  // Active rows + global indices (respects "show only errors" filter)
  const [activeRows, activeGlobalIndices] = useMemo(() => {
    if (!showOnlyErrors) return [mappedRows, mappedRows.map((_, i) => i)];
    const rows = [], indices = [];
    mappedRows.forEach((r, i) => {
      if (errorRowSet.has(i)) { rows.push(r); indices.push(i); }
    });
    return [rows, indices];
  }, [mappedRows, showOnlyErrors, errorRowSet]);

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

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [showOnlyErrors]);

  // Sorted list of hard-error cells for jump-to
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

    // Navigate to the correct page
    const localRi = activeGlobalIndices.indexOf(globalRi);
    if (localRi >= 0) {
      const targetPage = Math.floor(localRi / PAGE_SIZE);
      setPage(targetPage);
    } else if (showOnlyErrors) {
      // Error cell not in filtered view — shouldn't happen for hard errors, but handle gracefully
      setShowOnlyErrors(false);
      const allIdx = globalRi;
      setPage(Math.floor(allIdx / PAGE_SIZE));
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

  // Apply bulk replacements from DepResolveModal: { [fieldName]: { [sourceVal]: targetVal } }
  const handleApplyDepReplacements = (replacementsByField) => {
    setMappedRows(rows => rows.map(row => {
      const newRow = { ...row };
      for (const [fieldName, reps] of Object.entries(replacementsByField)) {
        const curr = row[fieldName];
        if (curr && reps[curr] !== undefined) {
          newRow[fieldName] = reps[curr];
        }
      }
      return newRow;
    }));
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
          background: '#FFFBE6', border: `1px solid ${C.warnBorder}`, borderRadius: 8,
          fontSize: 12, color: C.warnText,
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span>
            <strong>Dependency validation is inactive.</strong> Go to the{' '}
            <strong>Dependencies tab</strong> and click <strong>Update Dependencies</strong>{' '}
            to validate cross-field references against live FMX data.
          </span>
        </div>
      )}

      {/* ── Two-panel header: NL Edit (left) + Error Panel (right) ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: '1rem', alignItems: 'stretch' }}>

        {/* Left: NLEditPanel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <NLEditPanel headers={mappedHeaders} onApply={applyNLEdit} />
        </div>

        {/* Right: Error Panel */}
        <div style={{
          width: '44%', flexShrink: 0,
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '12px 16px', background: C.bgPage,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Error counts row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: errorCount > 0 ? C.errBg : C.okBg,
              color: errorCount > 0 ? C.errText : C.okText,
              border: `1px solid ${errorCount > 0 ? C.errBorder : C.okBorder}`,
            }}>
              🔴 {errorCount} cell{errorCount !== 1 ? 's' : ''} with missing required data
            </span>
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: depErrorCount > 0 ? C.warnBg : C.okBg,
              color: depErrorCount > 0 ? C.warnText : C.okText,
              border: `1px solid ${depErrorCount > 0 ? C.warnBorder : C.okBorder}`,
            }}>
              🟡 {depErrorCount} dependency mismatch{depErrorCount !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Action buttons row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

            {/* Show only error rows toggle */}
            <button
              onClick={() => setShowOnlyErrors(v => !v)}
              disabled={errorRowSet.size === 0}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 6,
                cursor: errorRowSet.size === 0 ? 'not-allowed' : 'pointer',
                background: showOnlyErrors ? C.navy : C.white,
                color: showOnlyErrors ? C.white : (errorRowSet.size === 0 ? C.textLight : C.textDark),
                border: `1px solid ${showOnlyErrors ? C.navy : C.border}`,
                fontWeight: showOnlyErrors ? 600 : 400,
                opacity: errorRowSet.size === 0 ? 0.6 : 1,
              }}
            >
              {showOnlyErrors ? '✓ Showing error rows only' : 'Show only error rows'}
            </button>

            {/* Jump to next hard error */}
            <button
              onClick={jumpToNextError}
              disabled={errorCells.length === 0}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 6,
                cursor: errorCells.length === 0 ? 'not-allowed' : 'pointer',
                background: errorCells.length === 0 ? C.bgPage : C.errBg,
                color: errorCells.length === 0 ? C.textLight : C.errText,
                border: `1px solid ${errorCells.length === 0 ? C.border : C.errBorder}`,
                whiteSpace: 'nowrap',
              }}
            >
              Jump to error ↓
            </button>

            {/* Fix dependency issues */}
            {depErrorCount > 0 && (
              <button
                onClick={handleFixAll}
                style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  background: C.warnBg, color: C.warnText,
                  border: `1px solid ${C.warnBorder}`,
                  fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                ⚠ Fix {depErrorCount} dep issue{depErrorCount !== 1 ? 's' : ''}
              </button>
            )}

            {/* Column visibility menu */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                onClick={() => setColMenuOpen(v => !v)}
                style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 6,
                  cursor: 'pointer', background: C.white, color: C.textDark,
                  border: `1px solid ${C.border}`,
                }}
              >
                Columns ▾
              </button>
              {colMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '8px 0', zIndex: 100, minWidth: 200, maxHeight: 320,
                  overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                }}>
                  <div style={{ padding: '4px 14px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
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
                    <label key={h} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.textDark,
                    }}>
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

          {/* Dep sync status + toast */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
            {depAutoSyncing && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMid }}>
                <div style={{
                  width: 11, height: 11, border: `2px solid ${C.border}`,
                  borderTopColor: C.orange, borderRadius: '50%',
                  animation: '_sv_spin 0.8s linear infinite', flexShrink: 0,
                }} />
                Refreshing dependencies…
              </span>
            )}
            {syncDoneToast && !depAutoSyncing && (
              <span style={{ fontSize: 11, color: C.okText, fontWeight: 600 }}>
                ✓ Dependencies updated
              </span>
            )}
            {noMoreMsg && (
              <span style={{ fontSize: 11, color: C.textMid, fontStyle: 'italic' }}>No more errors</span>
            )}
          </div>
        </div>
      </div>

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
      />

      {/* ── Pagination controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: C.textMid, flexWrap: 'wrap' }}>
        {totalPages > 1 && (
          <>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              style={pagerBtnStyle(clampedPage === 0)}
            >
              ← Prev
            </button>
            <span style={{ fontWeight: 500, color: C.textDark }}>
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage === totalPages - 1}
              style={pagerBtnStyle(clampedPage === totalPages - 1)}
            >
              Next →
            </button>
          </>
        )}
        <span style={{ color: C.textLight, marginLeft: totalPages > 1 ? 4 : 0 }}>
          {totalPages > 1
            ? `Rows ${pageStart}–${pageEnd} of ${activeRows.length}${showOnlyErrors ? ' error rows' : ''}`
            : `${activeRows.length} row${activeRows.length !== 1 ? 's' : ''}${showOnlyErrors ? ' with errors' : ''}`
          }
        </span>
        {showOnlyErrors && activeRows.length === 0 && (
          <span style={{ color: C.okText, fontWeight: 500 }}>✓ No error rows</span>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{ marginTop: "1rem" }}>
        {hasErrors && (
          <div style={{ padding: "12px 14px", background: C.errBg, border: `1px solid ${C.errBorder}`, borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: C.errText }}>There are cells with errors.</p>
              <p style={{ margin: 0, fontSize: 12, color: C.errText }}>Fix them above, or certify below to proceed anyway.</p>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, color: C.errText, fontWeight: 500 }}>
              <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} style={{ width: 15, height: 15 }} />
              Proceed anyway
            </label>
          </div>
        )}
        {!hasErrors && (
          <div style={{ padding: "12px 14px", background: C.okBg, border: `1px solid ${C.okBorder}`, borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.okText }}>
              No errors — all required fields are filled.
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
