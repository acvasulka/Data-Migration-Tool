import { C } from "../theme";
import ValidationSpreadsheet from "./ValidationSpreadsheet";

export default function StepExport({ schemaType, mappedRows, setMappedRows, mappedHeaders, allFields, handleExport, reset }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.navy }}>{schemaType} — {mappedRows.length} rows ready</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Final review. Click any cell to make last edits, then download.</p>
        </div>
        <button className="fmx-btn-primary" onClick={handleExport}>Download CSV</button>
      </div>
      <ValidationSpreadsheet
        headers={mappedHeaders}
        rows={mappedRows}
        cellErrors={{}}
        allFields={allFields}
        onChange={setMappedRows}
      />
      <button className="fmx-btn-secondary" onClick={reset} style={{ marginTop: "1.5rem" }}>Import another sheet</button>
    </div>
  );
}
