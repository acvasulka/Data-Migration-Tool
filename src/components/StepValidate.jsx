import { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import DepResolveModal from "./DepResolveModal";

const SPIN = `@keyframes _sv_spin { to { transform: rotate(360deg); } }`;

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

  // Which dep field to resolve (column header string) — null means "all"
  const [depResolveHeader, setDepResolveHeader] = useState(null);
  const [showDepModal, setShowDepModal] = useState(false);

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

  // Count dep_error cells
  const depErrorCount = useMemo(
    () => Object.values(cellErrors).filter(v => v === "dep_error").length,
    [cellErrors]
  );

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
    setFocusCell({ ...errorCells[next], _t: Date.now() });
  };

  const hasCacheData = Object.keys(depCacheMap || {}).length > 0;

  const handleDepColumnClick = (header) => {
    setDepResolveHeader(header);
    setShowDepModal(true);
  };

  const handleFixAll = () => {
    setDepResolveHeader(null); // null = all dep-errored fields
    setShowDepModal(true);
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

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <NLEditPanel headers={mappedHeaders} onApply={applyNLEdit} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
          {/* Dep sync status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
            {depAutoSyncing && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMid }}>
                <div style={{
                  width: 12, height: 12, border: `2px solid ${C.border}`,
                  borderTopColor: C.orange, borderRadius: '50%',
                  animation: '_sv_spin 0.8s linear infinite', flexShrink: 0,
                }} />
                Refreshing dependencies…
              </span>
            )}
            {syncDoneToast && !depAutoSyncing && (
              <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600 }}>
                ✓ Dependencies updated
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* Fix Dependency Issues button */}
            {depErrorCount > 0 && (
              <button
                onClick={handleFixAll}
                style={{
                  fontSize: 12, padding: "7px 13px", borderRadius: 6, cursor: "pointer",
                  background: C.warnBg, color: C.warnText,
                  border: `1px solid ${C.warnBorder}`,
                  whiteSpace: "nowrap", fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                ⚠ Fix {depErrorCount} dependency issue{depErrorCount !== 1 ? 's' : ''}
              </button>
            )}

            {/* Jump to hard error */}
            <button
              onClick={jumpToNextError}
              disabled={errorCells.length === 0}
              style={{
                fontSize: 13, padding: "7px 14px", borderRadius: 6,
                cursor: errorCells.length === 0 ? "not-allowed" : "pointer",
                background: errorCells.length === 0 ? C.bgPage : C.errBg,
                color: errorCells.length === 0 ? C.textLight : C.errText,
                border: `1px solid ${errorCells.length === 0 ? C.border : C.errBorder}`,
                whiteSpace: "nowrap", transition: "all 0.15s ease",
              }}
            >
              Jump to next error ↓
            </button>
          </div>

          {noMoreMsg && (
            <span style={{ fontSize: 12, color: C.textMid, fontStyle: "italic" }}>No more errors</span>
          )}
        </div>
      </div>

      <ValidationSpreadsheet
        headers={mappedHeaders}
        rows={mappedRows}
        cellErrors={cellErrors}
        allFields={allFields}
        focusCell={focusCell}
        onDepColumnClick={handleDepColumnClick}
        onChange={rows => { setMappedRows(rows); if (onRowsUpdated) onRowsUpdated(rows); }}
      />

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
