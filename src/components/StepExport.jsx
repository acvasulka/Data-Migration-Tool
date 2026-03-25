import { useState } from "react";
import { C } from "../theme";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import { saveMappings, saveRule, saveDataPatterns } from "../db";

export default function StepExport({ schemaType, mappedRows, setMappedRows, mappedHeaders, allFields, handleExport, orgId, mapping, transformRules }) {
  const [exportFormat, setExportFormat] = useState("csv");

  const handleDownload = () => {
    // Trigger file download immediately — don't block on saves
    handleExport(exportFormat);

    // Save mappings, rules, and data patterns in the background
    (async () => {
      try {
        // Build field samples for pattern analysis
        const fieldSamples = {};
        for (const field of allFields) {
          const samples = [...new Set(
            mappedRows.map(r => r[field.name]).filter(v => v !== undefined && v !== null && v !== '')
          )].slice(0, 10);
          if (samples.length > 0) fieldSamples[field.name] = samples;
        }

        // Get pattern hints from Claude (one call for all fields)
        let fieldPatterns = [];
        if (Object.keys(fieldSamples).length > 0) {
          try {
            const res = await fetch("/api/claude", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                messages: [{
                  role: "user",
                  content: `Analyze these data samples from an FMX ${schemaType} import. For each field, give a ONE sentence pattern hint describing the data format. Return ONLY a JSON object where keys are field names and values are pattern hint strings. Data samples: ${JSON.stringify(fieldSamples)}`
                }]
              })
            });
            const data = await res.json();
            const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
            const hints = JSON.parse(clean);
            fieldPatterns = Object.entries(fieldSamples).map(([fmxField, sampleValues]) => ({
              fmxField,
              sampleValues,
              patternHint: hints[fmxField] || null,
            }));
          } catch {}
        }

        // Build all save promises
        const saves = [saveMappings(orgId, schemaType, mapping)];

        Object.entries(transformRules || {}).forEach(([fieldName, rule]) => {
          if (rule?.instruction && rule?.code) {
            saves.push(saveRule(orgId, schemaType, fieldName, rule.instruction, rule.code));
          }
        });

        if (fieldPatterns.length > 0) {
          saves.push(saveDataPatterns(orgId, schemaType, fieldPatterns));
        }

        await Promise.all(saves);
      } catch {}
    })();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.navy }}>{schemaType} — {mappedRows.length} rows ready</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Final review. Click any cell to make last edits, then download.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
          <button className="fmx-btn-primary" onClick={handleDownload}>
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
