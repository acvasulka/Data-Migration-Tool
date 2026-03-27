import { useState, useMemo, useEffect } from "react";
import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import { getReferenceValues, getAllDependencyCaches } from "../db";

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
  importedData,
  onRefsLoaded,
}) {
  const [jumpIdx, setJumpIdx] = useState(-1);
  const [noMoreMsg, setNoMoreMsg] = useState(false);
  const [focusCell, setFocusCell] = useState(null);
  const [refCounts, setRefCounts] = useState(null); // { building, equipType }

  // Dependency cache key → crossSheet schema type mapping
  const DEP_KEY_TO_CROSS_SHEET = {
    'buildings':       'Building',
    'equipment-types': 'Equipment Type',
    'resources':       'Resource',
    'equipment':       'Equipment',
    'users':           'User',
    'request-types':   'Request Type',
    'inventory-types': 'Inventory Type',
    'inventory':       'Inventory',
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [buildingRefs, equipTypeRefs, depCaches] = await Promise.all([
        getReferenceValues(projectId, 'Building'),
        getReferenceValues(projectId, 'Equipment Type'),
        getAllDependencyCaches(projectId),
      ]);
      if (cancelled) return;

      const buildingNames = buildingRefs?.Name ?? [];
      const equipTypeNames = equipTypeRefs?.Name ?? [];

      // Start with dependency cache data (FMX live data)
      const fromDeps = {};
      for (const row of depCaches) {
        const crossSheet = DEP_KEY_TO_CROSS_SHEET[row.schema_type];
        if (crossSheet && row.extra?.items?.length) {
          fromDeps[crossSheet] = row.extra.items.map(i => i.name);
        }
      }

      // Merge: dependency cache → import-based refs → in-session data (highest priority)
      const merged = {
        ...fromDeps,
        ...(buildingNames.length ? { 'Building': buildingNames } : {}),
        ...(equipTypeNames.length ? { 'Equipment Type': equipTypeNames } : {}),
        ...importedData, // in-session data overrides
      };

      if (buildingNames.length > 0 || equipTypeNames.length > 0) {
        setRefCounts({ building: buildingNames.length, equipType: equipTypeNames.length });
      }

      onRefsLoaded(merged);
    })();
    return () => { cancelled = true; };
  }, [projectId]); // intentionally only re-runs when projectId changes

  // Sorted list of all error cells: [{ri, header}]
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

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <NLEditPanel headers={mappedHeaders} onApply={applyNLEdit} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
          <button
            onClick={jumpToNextError}
            disabled={errorCells.length === 0}
            style={{
              fontSize: 13, padding: "7px 14px", borderRadius: 6, cursor: errorCells.length === 0 ? "not-allowed" : "pointer",
              background: errorCells.length === 0 ? C.bgPage : C.errBg,
              color: errorCells.length === 0 ? C.textLight : C.errText,
              border: `1px solid ${errorCells.length === 0 ? C.border : C.errBorder}`,
              whiteSpace: "nowrap", transition: "all 0.15s ease",
            }}
          >
            Jump to next error ↓
          </button>
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
        onChange={rows => { setMappedRows(rows); if (onRowsUpdated) onRowsUpdated(rows); }}
      />

      {refCounts && (
        <p style={{ fontSize: 12, color: C.textLight, fontStyle: "italic", margin: "8px 0 0" }}>
          Cross-sheet validation loaded{refCounts.building > 0 ? ` ${refCounts.building} building name${refCounts.building !== 1 ? 's' : ''}` : ''}
          {refCounts.building > 0 && refCounts.equipType > 0 ? ' and' : ''}
          {refCounts.equipType > 0 ? ` ${refCounts.equipType} equipment type${refCounts.equipType !== 1 ? 's' : ''}` : ''} from project history
        </p>
      )}

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
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.okText }}>No errors — all required fields are filled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
