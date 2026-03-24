import { useState } from "react";
import { C } from "../theme";
import ValidationSpreadsheet from "./ValidationSpreadsheet";

export default function StepExport({ schemaType, mappedRows, setMappedRows, mappedHeaders, allFields, handleExport }) {
  const [exportFormat, setExportFormat] = useState("csv");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.navy }}>{schemaType} — {mappedRows.length} rows ready</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Final review. Click any cell to make last edits, then download.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Format pill toggle */}
          <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", fontSize: 13 }}>
            {["csv", "xlsx"].map(fmt => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                style={{
                  padding: "6px 14px", cursor: "pointer", border: "none", fontWeight: 500,
                  background: exportFormat === fmt ? C.navy : C.white,
                  color: exportFormat === fmt ? C.white : C.textMid,
                  transition: "all 0.15s ease",
                }}
              >
                {fmt === "csv" ? "CSV" : "Excel (.xlsx)"}
              </button>
            ))}
          </div>
          <button className="fmx-btn-primary" onClick={() => handleExport(exportFormat)}>
            {exportFormat === "csv" ? "Download CSV" : "Download Excel"}
          </button>
        </div>
      </div>
      <ValidationSpreadsheet
        headers={mappedHeaders}
        rows={mappedRows}
        cellErrors={{}}
        allFields={allFields}
        onChange={setMappedRows}
      />
    </div>
  );
}
