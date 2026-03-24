import { C } from "../theme";
import NLEditPanel from "./NLEditPanel";
import ValidationSpreadsheet from "./ValidationSpreadsheet";

export default function StepValidate({
  mappedHeaders,
  mappedRows,
  setMappedRows,
  cellErrors,
  allFields,
  hasErrors,
  certified,
  setCertified,
  canProceed,
  applyNLEdit,
  setWStep,
}) {
  return (
    <div>
      <NLEditPanel headers={mappedHeaders} onApply={applyNLEdit} />
      <ValidationSpreadsheet
        headers={mappedHeaders}
        rows={mappedRows}
        cellErrors={cellErrors}
        allFields={allFields}
        onChange={rows => setMappedRows(rows)}
      />
      <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
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
        <div style={{ display: "flex", gap: 10 }}>
          <button className="fmx-btn-primary" onClick={() => setWStep(4)} disabled={!canProceed}>Review & export →</button>
          <button className="fmx-btn-secondary" onClick={() => setWStep(2)}>← Back to mapping</button>
        </div>
      </div>
    </div>
  );
}
