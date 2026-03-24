import { useState, useRef } from "react";
import { FMX_SCHEMAS } from "./schemas";
import { parseCSV, buildMappedRows, computeCellErrors, downloadCSV, suggestMapping } from "./utils";
import { C } from "./theme";
import DataPreviewModal from "./components/DataPreviewModal";
import TransformModal from "./components/TransformModal";
import SessionHistory from "./components/SessionHistory";
import StepSelectType from "./components/StepSelectType";
import StepUpload from "./components/StepUpload";
import StepMapFields from "./components/StepMapFields";
import StepValidate from "./components/StepValidate";
import StepExport from "./components/StepExport";

const WIZARD_STEPS = ["Select Type", "Upload CSV", "Map Fields", "Validate & Edit", "Export"];

const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  input, select, textarea, button { font-family: system-ui, -apple-system, sans-serif; }
  .fmx-btn-primary {
    background: ${C.orange}; color: ${C.white}; border: none; border-radius: 6px;
    padding: 8px 20px; cursor: pointer; font-size: 14px; font-weight: 500;
    transition: all 0.15s ease;
  }
  .fmx-btn-primary:hover:not(:disabled) { background: ${C.orangeHov}; }
  .fmx-btn-primary:disabled { background: ${C.border}; color: ${C.textLight}; cursor: not-allowed; }
  .fmx-btn-secondary {
    background: ${C.white}; color: ${C.orange}; border: 1px solid ${C.orange};
    border-radius: 6px; padding: 8px 20px; cursor: pointer; font-size: 14px;
    font-weight: 500; transition: all 0.15s ease;
  }
  .fmx-btn-secondary:hover { background: #FFF5F2; }
  .fmx-btn-destructive {
    background: ${C.white}; color: #888; border: 1px solid #888;
    border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 13px;
    transition: all 0.15s ease;
  }
  .fmx-btn-destructive:hover { background: ${C.bgPage}; }
  .fmx-btn-xs {
    background: ${C.white}; color: ${C.textMid}; border: 1px solid ${C.border};
    border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 11px;
    transition: all 0.15s ease; white-space: nowrap;
  }
  .fmx-btn-xs:hover { background: ${C.bgPage}; }
  .fmx-btn-xs-rule {
    background: ${C.white}; color: ${C.orange}; border: 1px solid ${C.orange};
    border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 11px;
    transition: all 0.15s ease; white-space: nowrap;
  }
  .fmx-btn-xs-rule:hover { background: #FFF5F2; }
  .fmx-btn-xs-rule.active {
    background: ${C.errBg}; color: ${C.errText}; border-color: ${C.errBorder};
  }
  .fmx-btn-xs-rule.active:hover { background: #FFE5E5; }
  .fmx-input {
    font-size: 13px; padding: 6px 10px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; outline: none;
    transition: border-color 0.15s ease;
  }
  .fmx-input:focus { border-color: ${C.blue}; }
  select.fmx-select {
    font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; width: 100%;
  }
  textarea.fmx-textarea {
    font-size: 12px; padding: 8px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; resize: vertical; outline: none;
    width: 100%; box-sizing: border-box; transition: border-color 0.15s ease;
  }
  textarea.fmx-textarea:focus { border-color: ${C.blue}; }
  .fmx-type-card {
    padding: 14px 10px; border-radius: 8px; border: 1px solid ${C.border};
    background: ${C.white}; cursor: pointer; text-align: left; font-size: 13px;
    font-weight: 500; display: flex; flex-direction: column; gap: 6px;
    transition: all 0.15s ease;
  }
  .fmx-type-card:hover { background: ${C.navyTint}; border-color: ${C.navy}; }
  .fmx-tab {
    padding: 12px 16px; font-size: 13px; white-space: nowrap;
    user-select: none; border-bottom: 2px solid transparent;
    transition: all 0.15s ease; cursor: default;
  }
  .fmx-tab-active { font-weight: 700; color: ${C.orange}; border-bottom-color: ${C.orange}; }
  .fmx-tab-completed { color: ${C.blue}; cursor: pointer; }
  .fmx-tab-completed:hover { color: #4ab0cc; }
  .fmx-tab-inactive { color: ${C.textLight}; }
  .fmx-history-card {
    padding: 8px 10px; background: ${C.white}; border-radius: 6px;
    margin-bottom: 8px; border: 1px solid ${C.border};
    border-left: 3px solid ${C.blue};
  }
`;

export default function App() {
  const [importedData, setImportedData] = useState({});
  const [history, setHistory] = useState([]);
  const [wStep, setWStep] = useState(0);
  const [schemaType, setSchemaType] = useState("");
  const [csv, setCsv] = useState(null);
  const [mapping, setMapping] = useState({});
  const [transformRules, setTransformRules] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [dynamicRates, setDynamicRates] = useState([]);
  const [mappedRows, setMappedRows] = useState([]);
  const [certified, setCertified] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [transformModal, setTransformModal] = useState(null);
  const fileRef = useRef();

  const schema = schemaType ? FMX_SCHEMAS[schemaType] : null;
  const allFields = schema ? [
    ...schema.fields,
    ...customFields.filter(Boolean).map(cf => ({ name: cf, required: false, type: "string", group: "Custom Fields" })),
    ...dynamicRates.flatMap((_, i) => [
      { name: `Rate ${i + 1} Cost`, required: false, type: "number", group: "Scheduling Rates" },
      { name: `Rate ${i + 1} Unit`, required: false, type: "string", group: "Scheduling Rates" },
    ]),
  ] : [];
  const mappedHeaders = allFields.map(f => f.name);

  const cellErrors = wStep >= 3 ? computeCellErrors(mappedRows, allFields, importedData) : {};
  const hasErrors = Object.values(cellErrors).some(v => v === "error");

  const groupedFields = {};
  allFields.forEach(f => {
    const g = f.group || "Core Fields";
    if (!groupedFields[g]) groupedFields[g] = [];
    groupedFields[g].push(f);
  });

  const canProceed = !hasErrors || certified;

  const handleSelectType = t => {
    setSchemaType(t); setCustomFields([]); setDynamicRates([]);
    setTransformRules({}); setCertified(false); setWStep(1);
  };

  const handleFileAndMap = async file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const parsed = parseCSV(e.target.result);
      setCsv(parsed);
      setAiLoading(true);
      const suggested = suggestMapping(parsed.headers, FMX_SCHEMAS[schemaType].fields);
      try {
        const res = await fetch("/api/claude", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: `FMX data migration. Suggest best CSV→FMX column mapping. Return ONLY valid JSON object, keys=FMX field names, values=CSV column names or null. CSV headers: ${JSON.stringify(parsed.headers)}. FMX fields: ${JSON.stringify(FMX_SCHEMAS[schemaType].fields.map(f => f.name))}. Already matched: ${JSON.stringify(suggested)}.` }]
          })
        });
        const data = await res.json();
        const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        setMapping({ ...suggested, ...JSON.parse(clean) });
      } catch { setMapping(suggested); }
      setAiLoading(false);
      setWStep(2);
    };
    reader.readAsText(file);
  };

  const goToValidate = () => {
    setMappedRows(buildMappedRows(csv.rows, mapping, transformRules, allFields));
    setCertified(false);
    setWStep(3);
  };

  const applyNLEdit = (field, code) => {
    setMappedRows(rows => rows.map(row => {
      try {
        const fn = new Function("row", `"use strict"; ${code}`);
        const val = fn(row);
        if (val === null || val === undefined) return row;
        return { ...row, [field]: String(val) };
      } catch { return row; }
    }));
  };

  const handleExport = () => {
    const refField = schema.crossRef;
    if (refField) {
      const vals = [...new Set(mappedRows.map(r => r[refField]).filter(Boolean))];
      setImportedData(prev => ({ ...prev, [schemaType]: vals }));
    }
    setHistory(h => [...h, { type: schemaType, rows: mappedRows.length, time: new Date().toLocaleTimeString() }]);
    downloadCSV(`${schemaType.replace(/\s+/g, "_")}_FMX_Import.csv`, mappedHeaders, mappedRows);
  };

  const reset = () => {
    setWStep(0); setSchemaType(""); setCsv(null); setMapping({});
    setTransformRules({}); setCustomFields([]); setDynamicRates([]);
    setMappedRows([]); setCertified(false);
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPage, minHeight: "100vh", color: C.textDark }}>
      <style>{GLOBAL_STYLES}</style>

      {preview && <DataPreviewModal header={preview.header} values={preview.values} onClose={() => setPreview(null)} />}
      {transformModal && (
        <TransformModal
          fieldName={transformModal}
          csvHeaders={csv?.headers || []}
          currentRule={transformRules[transformModal]}
          onSave={rule => { setTransformRules(r => ({ ...r, [transformModal]: { ...rule, type: "formula" } })); setTransformModal(null); }}
          onClose={() => setTransformModal(null)}
        />
      )}

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, height: 52, background: C.navy, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: C.white, fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
        <span style={{ color: C.blue, fontSize: 13 }}>Step {wStep + 1} — {WIZARD_STEPS[wStep]}</span>
      </div>

      {/* Page content */}
      <div style={{ padding: "1.5rem 24px 2rem" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Main wizard area */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Step tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: "1.5rem", overflowX: "auto" }}>
              {WIZARD_STEPS.map((label, i) => (
                <div
                  key={i}
                  className={`fmx-tab ${i === wStep ? "fmx-tab-active" : i < wStep ? "fmx-tab-completed" : "fmx-tab-inactive"}`}
                  onClick={() => i < wStep && setWStep(i)}
                >
                  {i + 1}. {label}
                </div>
              ))}
            </div>

            {wStep === 0 && <StepSelectType history={history} onSelectType={handleSelectType} />}

            {wStep === 1 && (
              <StepUpload
                schemaType={schemaType}
                aiLoading={aiLoading}
                dragOver={dragOver}
                setDragOver={setDragOver}
                fileRef={fileRef}
                handleFileAndMap={handleFileAndMap}
              />
            )}

            {wStep === 2 && schema && (
              <StepMapFields
                csv={csv}
                schemaType={schemaType}
                allFields={allFields}
                groupedFields={groupedFields}
                mapping={mapping}
                setMapping={setMapping}
                transformRules={transformRules}
                setTransformRules={setTransformRules}
                customFields={customFields}
                setCustomFields={setCustomFields}
                dynamicRates={dynamicRates}
                setDynamicRates={setDynamicRates}
                goToValidate={goToValidate}
                setPreview={setPreview}
                setTransformModal={setTransformModal}
              />
            )}

            {wStep === 3 && (
              <StepValidate
                mappedHeaders={mappedHeaders}
                mappedRows={mappedRows}
                setMappedRows={setMappedRows}
                cellErrors={cellErrors}
                allFields={allFields}
                hasErrors={hasErrors}
                certified={certified}
                setCertified={setCertified}
                canProceed={canProceed}
                applyNLEdit={applyNLEdit}
                setWStep={setWStep}
              />
            )}

            {wStep === 4 && (
              <StepExport
                schemaType={schemaType}
                mappedRows={mappedRows}
                setMappedRows={setMappedRows}
                mappedHeaders={mappedHeaders}
                allFields={allFields}
                handleExport={handleExport}
                reset={reset}
              />
            )}
          </div>

          <SessionHistory history={history} />
        </div>
      </div>
    </div>
  );
}
