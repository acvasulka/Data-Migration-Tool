import { useState } from "react";
import { C } from "../theme";
import ValidationSpreadsheet from "./ValidationSpreadsheet";
import { saveMappings, saveRule, saveDataPatterns, completeImport } from "../db";
import FMXPushModal from "./FMXPushModal";

export default function StepExport({
  schemaType,
  mappedRows,
  setMappedRows,
  mappedHeaders,
  allFields,
  handleExport,
  mapping,
  transformRules,
  projectId,
  onImportComplete,
  selectedProject,
  userEmail,
  customFieldIdMap,
  customFieldMetadata,
  fileInfo,
}) {
  const [exportFormat, setExportFormat] = useState("csv");
  const [showFMXModal, setShowFMXModal] = useState(false);

  // Shared background persistence — called after both CSV download and FMX push
  const runPersistence = () => {
    (async () => {
      try {
        // Build reference values for cross-sheet validation
        let referenceValues = [];
        if (schemaType === 'Building' || schemaType === 'Equipment Type') {
          const uniqueNames = [...new Set(mappedRows.map(r => r['Name']).filter(Boolean))];
          referenceValues = uniqueNames.map(v => ({ fieldName: 'Name', value: v }));
        } else {
          const crossSheetFields = allFields.filter(f => f.crossSheet);
          for (const field of crossSheetFields) {
            const uniqueVals = [...new Set(mappedRows.map(r => r[field.name]).filter(Boolean))];
            uniqueVals.forEach(v => referenceValues.push({ fieldName: field.name, value: v }));
          }
        }

        // Build field samples for pattern analysis
        const fieldSamples = {};
        for (const field of allFields) {
          const samples = [...new Set(
            mappedRows.map(r => r[field.name]).filter(v => v !== undefined && v !== null && v !== '')
          )].slice(0, 10);
          if (samples.length > 0) fieldSamples[field.name] = samples;
        }

        // Get pattern hints from Claude
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
              fmxField, sampleValues, patternHint: hints[fmxField] || null,
            }));
          } catch {}
        }

        const saves = [saveMappings(schemaType, mapping)];

        Object.entries(transformRules || {}).forEach(([fieldName, rule]) => {
          if (rule?.instruction && rule?.code) {
            saves.push(saveRule(schemaType, fieldName, rule.instruction, rule.code));
          }
        });

        if (fieldPatterns.length > 0) saves.push(saveDataPatterns(schemaType, fieldPatterns));
        if (projectId) saves.push(completeImport(
          projectId, schemaType, mappedRows.length, mapping, referenceValues,
          mappedRows, null, fileInfo?.name || null
        ));

        await Promise.all(saves);

        if (onImportComplete) onImportComplete({ schemaType, referenceValues });
      } catch {}
    })();
  };

  const handleDownload = () => {
    handleExport(exportFormat);
    runPersistence();
  };

  return (
    <div>
      {showFMXModal && (
        <FMXPushModal
          schemaType={schemaType}
          mappedRows={mappedRows}
          projectId={projectId}
          fmxSiteUrl={selectedProject?.fmx_site_url || ''}
          fmxEmail={selectedProject?.fmx_api_email || ''}
          fmxCredentials={selectedProject?.fmx_credentials || ''}
          customFieldIdMap={customFieldIdMap || {}}
          customFieldMetadata={customFieldMetadata || []}
          onClose={() => setShowFMXModal(false)}
          onSuccess={() => { setShowFMXModal(false); runPersistence(); }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.navy }}>{schemaType} — {mappedRows.length} rows ready</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Final review. Click any cell to make last edits, then download.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          <button
            onClick={() => setShowFMXModal(true)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 500,
              background: C.navy, color: C.white,
              border: 'none', borderRadius: 6, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: 'background 0.15s ease',
            }}
          >
            Send to FMX →
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
