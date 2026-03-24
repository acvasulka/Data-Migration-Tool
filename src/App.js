import { useState, useRef, useCallback } from "react";

const IMPORT_ORDER = ["Building", "Resource", "User", "Equipment Type", "Equipment", "Inventory"];

const FMX_SCHEMAS = {
  Building: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Tax rate", required: false, type: "number" },
      { name: "Address", required: false, type: "string" },
      { name: "Latitude", required: false, type: "number" },
      { name: "Longitude", required: false, type: "number" },
      { name: "Phone", required: false, type: "string" },
      { name: "Entrances", required: false, type: "string" },
      { name: "Additional comments", required: false, type: "string" },
      { name: "Area (sq ft)", required: false, type: "number" },
      { name: "Emergency info", required: false, type: "string" },
      { name: "Year built", required: false, type: "number" },
      { name: "Sunday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Sunday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Approval order (Standard)", required: false, type: "string", group: "Scheduling Periods" },
      { name: "Approval order (After hours)", required: false, type: "string", group: "Scheduling Periods" },
      { name: "Maintenance Name", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance From", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance To", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Maintenance Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Planning Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Planning Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Test Requires finalization", required: false, type: "string", group: "Work Request Settings" },
      { name: "Test Email footer", required: false, type: "string", group: "Work Request Settings" },
      { name: "Transportation Approval order", required: false, type: "string", group: "Transportation Request Settings" },
    ],
    crossRef: "Name",
  },
  Resource: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Address", required: false, type: "string" },
      { name: "Latitude", required: false, type: "number" },
      { name: "Longitude", required: false, type: "number" },
      { name: "Location", required: false, type: "string" },
      { name: "Resource type", required: false, type: "string" },
      { name: "Capacity", required: false, type: "number" },
      { name: "Display Image", required: false, type: "string" },
      { name: "Sunday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Sunday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Monday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Tuesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Wednesday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Thursday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Friday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday From", required: false, type: "string", group: "Operating Hours" },
      { name: "Saturday To", required: false, type: "string", group: "Operating Hours" },
      { name: "Schedulable", required: false, type: "string" },
      { name: "Requires approval", required: false, type: "string" },
      { name: "Requires estimating", required: false, type: "string" },
      { name: "Requires invoicing", required: false, type: "string" },
      { name: "Quantity", required: false, type: "number" },
      { name: "Disable conflicts", required: false, type: "string" },
      { name: "Permitted user types", required: false, type: "string" },
      { name: "Approval order 1 (Standard)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 1 (After hours)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 2 (Standard)", required: false, type: "string", group: "Approval Order" },
      { name: "Approval order 2 (After hours)", required: false, type: "string", group: "Approval Order" },
      { name: "Pickup location", required: false, type: "string" },
    ],
    crossRef: null,
  },
  User: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Email", required: true, type: "email" },
      { name: "User type", required: true, type: "string" },
      { name: "Time zone", required: false, type: "string" },
      { name: "Password", required: false, type: "string" },
      { name: "Require password change", required: false, type: "string" },
      { name: "Building access", required: false, type: "string", crossSheet: "Building" },
      { name: "Phone", required: false, type: "string" },
      { name: "Alternative invoice recipient email", required: false, type: "email" },
      { name: "Labor rate", required: false, type: "number" },
      { name: "Can be a driver", required: false, type: "string" },
      { name: "Liability insurance expiration date", required: false, type: "date" },
      { name: "Is contact", required: false, type: "string" },
      { name: "Is supplier", required: false, type: "string" },
      { name: "Reports to", required: false, type: "string" },
    ],
    crossRef: null,
  },
  "Equipment Type": {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Modules", required: false, type: "string" },
      { name: "Track meters", required: false, type: "string" },
      { name: "Track downtime", required: false, type: "string" },
      { name: "Track asset lifespan", required: false, type: "string" },
      { name: "Permitted user types", required: false, type: "string" },
    ],
    crossRef: "Name",
  },
  Equipment: {
    fields: [
      { name: "Tag", required: true, type: "string" },
      { name: "Type", required: true, type: "string", crossSheet: "Equipment Type" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Location", required: false, type: "string" },
      { name: "Inventory items", required: false, type: "string" },
      { name: "Assigned users", required: false, type: "string" },
      { name: "Downtime calculation start date", required: false, type: "date" },
      { name: "Attachment IDs", required: false, type: "string" },
      { name: "Barcode ID", required: false, type: "string" },
      { name: "Cooling Capacity", required: false, type: "number" },
      { name: "Date of Manufacture", required: false, type: "date" },
      { name: "Expected Replacement Cost", required: false, type: "number" },
      { name: "Expected Replacement Date", required: false, type: "date" },
      { name: "Filter size", required: false, type: "string" },
      { name: "Heating Capacity", required: false, type: "number" },
      { name: "Installed Cost", required: false, type: "number" },
      { name: "Installed Date", required: false, type: "date" },
      { name: "Manufacturer", required: false, type: "string" },
      { name: "Model number", required: false, type: "string" },
      { name: "Serial number", required: false, type: "string" },
      { name: "Asset Condition", required: false, type: "string" },
      { name: "Installation date", required: false, type: "date" },
      { name: "Estimated end-of-life (EOL)", required: false, type: "date" },
      { name: "Planned replacement date", required: false, type: "date" },
      { name: "Replacement asset value", required: false, type: "number" },
      { name: "Budget Category", required: false, type: "string" },
    ],
    crossRef: null,
  },
  Inventory: {
    fields: [
      { name: "Name", required: true, type: "string" },
      { name: "Type", required: true, type: "string" },
      { name: "Building", required: true, type: "string", crossSheet: "Building" },
      { name: "Location", required: true, type: "string" },
      { name: "Current quantity", required: true, type: "number" },
      { name: "SKU", required: false, type: "string" },
      { name: "Equipment items", required: false, type: "string" },
      { name: "Minimum quantity", required: false, type: "number" },
      { name: "Unit price", required: false, type: "number" },
      { name: "Assigned users", required: false, type: "string" },
      { name: "Suppliers", required: false, type: "string" },
      { name: "Image ID", required: false, type: "string" },
      { name: "Image alt text", required: false, type: "string" },
      { name: "Attachment IDs", required: false, type: "string" },
      { name: "Barcode Number", required: false, type: "string" },
      { name: "Image", required: false, type: "string" },
    ],
    crossRef: null,
  },
};

function parseCSV(raw) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const rows = []; let i = 0;
  const parseRow = () => {
    const cells = [];
    while (i < text.length && text[i] !== "\n") {
      if (text[i] === '"') {
        i++; let val = "";
        while (i < text.length) {
          if (text[i] === '"' && text[i+1] === '"') { val += '"'; i += 2; }
          else if (text[i] === '"') { i++; break; }
          else val += text[i++];
        }
        cells.push(val);
        if (text[i] === ",") i++;
      } else {
        let val = "";
        while (i < text.length && text[i] !== "," && text[i] !== "\n") val += text[i++];
        cells.push(val.trim());
        if (text[i] === ",") i++;
      }
    }
    if (text[i] === "\n") i++;
    return cells;
  };
  while (i < text.length) rows.push(parseRow());
  if (rows.length < 2) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== "")).map(cells =>
    Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ""]))
  );
  return { headers, rows: dataRows };
}

function buildMappedRows(rows, mapping, transformRules, allFields) {
  return rows.map(row => {
    const out = {};
    allFields.forEach(f => {
      if (transformRules[f.name]) return;
      const col = mapping[f.name];
      out[f.name] = col ? (row[col] ?? "") : "";
    });
    Object.entries(transformRules).forEach(([fName, rule]) => {
      if (rule.type === "formula" && rule.code) {
        try { const fn = new Function("row", "mapping", `"use strict"; ${rule.code}`); out[fName] = fn(row, mapping) ?? ""; }
        catch { out[fName] = ""; }
      }
    });
    return out;
  });
}

function computeCellErrors(rows, allFields, importedData) {
  // returns map: `${rowIdx}-${fieldName}` -> "error"|"warning"
  const cellMap = {};
  allFields.forEach(f => {
    rows.forEach((row, ri) => {
      const val = row[f.name] ?? "";
      const key = `${ri}-${f.name}`;
      if (f.required && !val) { cellMap[key] = "error"; return; }
      if (!val) return;
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { cellMap[key] = "error"; return; }
      if (f.type === "date" && isNaN(Date.parse(val))) { cellMap[key] = "error"; return; }
      if (f.type === "number" && isNaN(Number(val))) { cellMap[key] = "error"; return; }
      if (f.crossSheet && importedData[f.crossSheet] && !importedData[f.crossSheet].includes(val)) { cellMap[key] = "warning"; }
    });
  });
  return cellMap;
}

function toCSV(headers, rows) {
  const esc = v => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.map(esc).join(","), ...rows.map(r => headers.map(h => esc(r[h] ?? "")).join(","))].join("\n");
}
function downloadCSV(filename, headers, rows) {
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(toCSV(headers, rows));
  a.download = filename; a.click();
}
function suggestMapping(headers, fields) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {};
  fields.forEach(f => {
    const m = headers.find(h => norm(h) === norm(f.name) || norm(h).includes(norm(f.name)) || norm(f.name).includes(norm(h)));
    if (m) map[f.name] = m;
  });
  return map;
}

const WIZARD_STEPS = ["Select Type", "Upload CSV", "Map Fields", "Validate & Edit", "Export"];

function Badge({ children, color = "gray" }) {
  const p = { gray: ["var(--color-background-secondary)", "var(--color-text-secondary)", "var(--color-border-secondary)"], green: ["var(--color-background-success)", "var(--color-text-success)", "var(--color-border-success)"], amber: ["var(--color-background-warning)", "var(--color-text-warning)", "var(--color-border-warning)"], red: ["var(--color-background-danger)", "var(--color-text-danger)", "var(--color-border-danger)"] };
  const [bg, fg, bd] = p[color] || p.gray;
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--border-radius-md)", background: bg, color: fg, border: `0.5px solid ${bd}`, whiteSpace: "nowrap" }}>{children}</span>;
}

// Solid modal wrapper — no translucent overlay bleed
function Modal({ width = 380, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ width, background: "var(--color-background-primary)", border: "1px solid var(--color-border-primary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem", boxShadow: "0 4px 24px rgba(0,0,0,0.18)", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function DataPreviewModal({ header, values, onClose }) {
  return (
    <Modal width={340} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>"{header}" — sample values</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-secondary)", lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      {values.length === 0
        ? <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No data found in this column.</p>
        : values.map((v, i) => (
          <div key={i} style={{ fontSize: 13, padding: "5px 8px", background: i % 2 === 0 ? "var(--color-background-secondary)" : "var(--color-background-primary)", borderRadius: 4, color: v ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
            {v || "(empty)"}
          </div>
        ))}
    </Modal>
  );
}

function TransformModal({ fieldName, csvHeaders, currentRule, onSave, onClose }) {
  const [instruction, setInstruction] = useState(currentRule?.instruction || "");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(currentRule?.code || "");
  const [err, setErr] = useState("");

  const generate = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setErr("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          messages: [{ role: "user", content: `You are a JavaScript code generator for a data migration tool. Write a function body (no declaration) that receives a "row" object (keys = CSV column names) and returns the computed string value for FMX field "${fieldName}". Available columns: ${JSON.stringify(csvHeaders)}. Instruction: "${instruction}". Return ONLY raw JS, no markdown, no explanation.` }]
        })
      });
      const data = await res.json();
      setCode((data.content?.[0]?.text || "").replace(/```javascript|```js|```/g, "").trim());
    } catch { setErr("Generation failed — check connection."); }
    setLoading(false);
  };

  return (
    <Modal width={440} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Transform rule — "{fieldName}"</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-secondary)", lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>Describe what this field should contain in plain language:</p>
      <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
        placeholder={`e.g. "Combine 'description' and 'type' with a dash. If only one exists, use that."`}
        style={{ width: "100%", boxSizing: "border-box", fontSize: 12, padding: 8, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", minHeight: 72, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={generate} disabled={loading} style={{ fontSize: 12, padding: "6px 14px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
          {loading ? "Generating..." : "Generate rule"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: "var(--color-text-danger)", marginTop: 6 }}>{err}</p>}
      {code && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Generated rule (editable)</p>
          <textarea value={code} onChange={e => setCode(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 11, fontFamily: "var(--font-mono)", padding: 8, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", minHeight: 100, resize: "vertical" }} />
          <button onClick={() => onSave({ instruction, code })}
            style={{ marginTop: 8, fontSize: 12, padding: "6px 18px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-success)", background: "var(--color-background-success)", color: "var(--color-text-success)", cursor: "pointer", fontWeight: 500 }}>
            Apply rule
          </button>
        </div>
      )}
    </Modal>
  );
}

function NLEditPanel({ headers, onApply }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const apply = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setErr("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 400,
          messages: [{ role: "user", content: `You are a data transformation assistant. The user wants to update rows in a table. Available FMX fields: ${JSON.stringify(headers)}. Instruction: "${instruction}". Return ONLY a JSON object with two keys: "field" (the FMX field name to update) and "code" (a JS function body that receives a "row" object and returns the new value for that field, or null to skip the row). No markdown, no explanation.` }]
        })
      });
      const data = await res.json();
      const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const { field, code } = JSON.parse(clean);
      if (field && code) onApply(field, code);
      setInstruction("");
    } catch { setErr("Failed to parse instruction — try rephrasing."); }
    setLoading(false);
  };

  return (
    <div style={{ padding: "12px 14px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Bulk edit in plain language</p>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>e.g. "Fill blank 'Type' fields with HVAC" or "Set Building to 'Main Campus' where it's empty"</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => e.key === "Enter" && apply()}
          placeholder="Describe what to change..." style={{ flex: 1, fontSize: 13 }} />
        <button onClick={apply} disabled={loading} style={{ fontSize: 13, padding: "6px 16px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", whiteSpace: "nowrap", color: "var(--color-text-primary)" }}>
          {loading ? "Applying..." : "Apply"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: "var(--color-text-danger)", marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function ValidationSpreadsheet({ headers, rows, cellErrors, allFields, onChange }) {
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef();

  const startEdit = (ri, h, val) => { setEditCell(`${ri}-${h}`); setEditVal(val); setTimeout(() => inputRef.current?.focus(), 0); };
  const commit = (ri, h) => { onChange(rows.map((r, i) => i === ri ? { ...r, [h]: editVal } : r)); setEditCell(null); };
  const handleKey = (e, ri, h) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commit(ri, h); } if (e.key === "Escape") setEditCell(null); };
  const addRow = () => onChange([...rows, Object.fromEntries(headers.map(h => [h, ""]))]);
  const removeRow = ri => onChange(rows.filter((_, i) => i !== ri));

  const getCellBg = (ri, h) => {
    const key = `${ri}-${h}`;
    if (cellErrors[key] === "error") return "#fff0f0";
    if (cellErrors[key] === "warning") return "#fffbe6";
    return ri % 2 === 0 ? "var(--color-background-primary)" : "var(--color-background-secondary)";
  };
  const getCellColor = (ri, h) => {
    const key = `${ri}-${h}`;
    if (cellErrors[key] === "error") return "#c0392b";
    if (cellErrors[key] === "warning") return "#856404";
    return "var(--color-text-primary)";
  };

  const CW = 130;
  const errorCount = Object.values(cellErrors).filter(v => v === "error").length;
  const warnCount = Object.values(cellErrors).filter(v => v === "warning").length;

  return (
    <div>
      {(errorCount > 0 || warnCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          {errorCount > 0 && <span style={{ fontSize: 12, padding: "4px 10px", background: "#fff0f0", color: "#c0392b", border: "0.5px solid #f5c6cb", borderRadius: "var(--border-radius-md)" }}>{errorCount} cell{errorCount > 1 ? "s" : ""} with errors (red)</span>}
          {warnCount > 0 && <span style={{ fontSize: 12, padding: "4px 10px", background: "#fffbe6", color: "#856404", border: "0.5px solid #ffeaa7", borderRadius: "var(--border-radius-md)" }}>{warnCount} cross-sheet warning{warnCount > 1 ? "s" : ""} (yellow)</span>}
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "4px 0" }}>Click any cell to edit inline</span>
        </div>
      )}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: (headers.length + 1) * CW }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              <th style={{ width: 32, padding: "7px 8px", borderBottom: "0.5px solid var(--color-border-tertiary)", borderRight: "0.5px solid var(--color-border-tertiary)" }}></th>
              {headers.map(h => {
                const f = allFields.find(f => f.name === h);
                return (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 500, borderBottom: "0.5px solid var(--color-border-tertiary)", borderRight: "0.5px solid var(--color-border-tertiary)", whiteSpace: "nowrap", width: CW, maxWidth: CW, overflow: "hidden", textOverflow: "ellipsis", color: "var(--color-text-primary)" }}>
                    {h}{f?.required && <span style={{ color: "#c0392b" }}> *</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td style={{ padding: "4px 6px", borderBottom: "0.5px solid var(--color-border-tertiary)", borderRight: "0.5px solid var(--color-border-tertiary)", textAlign: "center", background: "var(--color-background-secondary)" }}>
                  <button onClick={() => removeRow(ri)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 14, padding: 0 }}>×</button>
                </td>
                {headers.map(h => {
                  const key = `${ri}-${h}`, isEditing = editCell === key;
                  const bg = getCellBg(ri, h), fg = getCellColor(ri, h);
                  return (
                    <td key={h} style={{ padding: 0, borderBottom: "0.5px solid var(--color-border-tertiary)", borderRight: "0.5px solid var(--color-border-tertiary)", width: CW, maxWidth: CW, background: bg }}>
                      {isEditing
                        ? <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commit(ri, h)} onKeyDown={e => handleKey(e, ri, h)}
                            style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", fontSize: 12, border: "none", outline: "2px solid var(--color-border-info)", background: "var(--color-background-info)", color: "var(--color-text-primary)", borderRadius: 0 }} />
                        : <div onClick={() => startEdit(ri, h, row[h] ?? "")}
                            style={{ padding: "5px 8px", minHeight: 28, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row[h] ? fg : "var(--color-text-tertiary)", fontWeight: cellErrors[key] ? 500 : 400 }}>
                            {row[h] || "—"}
                          </div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} style={{ marginTop: 8, fontSize: 12, padding: "5px 14px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>+ Add row</button>
    </div>
  );
}

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
      { name: `Rate ${i+1} Cost`, required: false, type: "number", group: "Scheduling Rates" },
      { name: `Rate ${i+1} Unit`, required: false, type: "string", group: "Scheduling Rates" },
    ])
  ] : [];
  const mappedHeaders = allFields.map(f => f.name);

  const cellErrors = wStep >= 3 ? computeCellErrors(mappedRows, allFields, importedData) : {};
  const hasErrors = Object.values(cellErrors).some(v => v === "error");
  const hasWarnings = Object.values(cellErrors).some(v => v === "warning");

  const handleSelectType = t => { setSchemaType(t); setCustomFields([]); setDynamicRates([]); setTransformRules({}); setCertified(false); setWStep(1); };

  const handleFileAndMap = async file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const parsed = parseCSV(e.target.result);
      setCsv(parsed);
      setAiLoading(true);
      const suggested = suggestMapping(parsed.headers, FMX_SCHEMAS[schemaType].fields);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    const built = buildMappedRows(csv.rows, mapping, transformRules, allFields);
    setMappedRows(built);
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

  const reset = () => { setWStep(0); setSchemaType(""); setCsv(null); setMapping({}); setTransformRules({}); setCustomFields([]); setDynamicRates([]); setMappedRows([]); setCertified(false); };

  const groupedFields = {};
  allFields.forEach(f => { const g = f.group || "Core Fields"; if (!groupedFields[g]) groupedFields[g] = []; groupedFields[g].push(f); });

  const getColPreview = col => !csv || !col ? [] : [...new Set(csv.rows.map(r => r[col]).filter(v => v !== undefined))].slice(0, 20);

  const canProceed = !hasErrors || certified;

  return (
    <div style={{ padding: "0 0 2rem" }}>
      {preview && <DataPreviewModal header={preview.header} values={preview.values} onClose={() => setPreview(null)} />}
      {transformModal && <TransformModal fieldName={transformModal} csvHeaders={csv?.headers || []} currentRule={transformRules[transformModal]}
        onSave={rule => { setTransformRules(r => ({ ...r, [transformModal]: { ...rule, type: "formula" } })); setTransformModal(null); }}
        onClose={() => setTransformModal(null)} />}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Step tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.5rem", overflowX: "auto" }}>
            {WIZARD_STEPS.map((label, i) => (
              <div key={i} onClick={() => i < wStep && setWStep(i)} style={{ padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap", fontWeight: i === wStep ? 500 : 400, color: i === wStep ? "var(--color-text-primary)" : i < wStep ? "var(--color-text-info)" : "var(--color-text-tertiary)", borderBottom: i === wStep ? "2px solid var(--color-text-primary)" : "2px solid transparent", cursor: i < wStep ? "pointer" : "default" }}>
                {i+1}. {label}
              </div>
            ))}
          </div>

          {/* Step 0 — Select Type */}
          {wStep === 0 && (
            <div>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Suggested order: {IMPORT_ORDER.join(" → ")}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                {IMPORT_ORDER.map(type => (
                  <button key={type} onClick={() => handleSelectType(type)} style={{ padding: "14px 10px", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ color: "var(--color-text-primary)" }}>{type}</span>
                    {history.filter(h => h.type === type).length > 0 && <Badge color="green">{history.filter(h => h.type === type).reduce((a,b)=>a+b.rows,0)} rows exported</Badge>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Upload */}
          {wStep === 1 && (
            <div>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Importing into: <strong style={{ color: "var(--color-text-primary)" }}>{schemaType}</strong></p>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFileAndMap(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current.click()}
                style={{ border: `2px dashed ${dragOver ? "var(--color-border-info)" : "var(--color-border-secondary)"}`, borderRadius: "var(--border-radius-lg)", padding: "2.5rem 2rem", textAlign: "center", cursor: "pointer", background: dragOver ? "var(--color-background-info)" : "var(--color-background-secondary)" }}>
                <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 6px", color: "var(--color-text-primary)" }}>Drag & drop CSV here</p>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>or click to browse</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFileAndMap(e.target.files[0])} />
              {aiLoading && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 12 }}>Analyzing columns and suggesting mappings...</p>}
            </div>
          )}

          {/* Step 2 — Map Fields */}
          {wStep === 2 && schema && (
            <div>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>{csv.rows.length} rows</strong> · <strong style={{ color: "var(--color-text-primary)" }}>{csv.headers.length} columns</strong> detected. Map CSV columns to FMX fields. <span style={{ color: "#c0392b" }}>*</span> = required.
              </p>
              {(schemaType === "Building" || schemaType === "Resource") && (
                <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Custom fields</p>
                  {customFields.map((cf, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={cf} onChange={e => setCustomFields(fs => fs.map((f,j) => j===i ? e.target.value : f))} placeholder="Custom field name" style={{ flex: 1, fontSize: 13 }} />
                      <button onClick={() => setCustomFields(fs => fs.filter((_,j) => j!==i))} style={{ fontSize: 13, padding: "4px 10px" }}>Remove</button>
                    </div>
                  ))}
                  <button onClick={() => setCustomFields(fs => [...fs, ""])} style={{ fontSize: 13, padding: "4px 12px" }}>+ Add custom field</button>
                </div>
              )}
              {schemaType === "Resource" && (
                <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Scheduling rate buckets</p>
                  {dynamicRates.map((_, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 60 }}>Rate {i+1}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Cost + Unit</span>
                      <button onClick={() => setDynamicRates(r => r.filter((_,j) => j!==i))} style={{ fontSize: 13, padding: "4px 10px", marginLeft: "auto" }}>Remove</button>
                    </div>
                  ))}
                  <button onClick={() => setDynamicRates(r => [...r, ""])} style={{ fontSize: 13, padding: "4px 12px" }}>+ Add rate bucket</button>
                </div>
              )}
              {Object.entries(groupedFields).map(([group, fields]) => (
                <div key={group} style={{ marginBottom: "1.5rem" }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{group}</p>
                  <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                    {fields.map((f, i) => {
                      const hasRule = !!transformRules[f.name], mappedCol = mapping[f.name];
                      return (
                        <div key={f.name} style={{ display: "grid", gridTemplateColumns: "180px 16px 1fr auto auto", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: i < fields.length-1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: hasRule ? "var(--color-background-info)" : i % 2 === 0 ? "var(--color-background-primary)" : "var(--color-background-secondary)" }}>
                          <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-primary)" }}>
                            {f.name}{f.required && <span style={{ color: "#c0392b" }}> *</span>}
                            {f.crossSheet && <span style={{ fontSize: 10, color: "var(--color-text-info)", marginLeft: 5 }}>→{f.crossSheet}</span>}
                          </div>
                          <div style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>→</div>
                          {hasRule
                            ? <span style={{ fontSize: 12, color: "var(--color-text-info)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Rule: {transformRules[f.name].instruction}</span>
                            : <select value={mappedCol ?? ""} onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value || undefined }))}
                                style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" }}>
                                <option value="">— skip —</option>
                                {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>}
                          {mappedCol && !hasRule && (
                            <button onClick={() => setPreview({ header: mappedCol, values: getColPreview(mappedCol) })}
                              style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                              View data
                            </button>
                          )}
                          <button onClick={() => hasRule ? setTransformRules(r => { const n={...r}; delete n[f.name]; return n; }) : setTransformModal(f.name)}
                            style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--border-radius-md)", border: `0.5px solid ${hasRule ? "var(--color-border-danger)" : "var(--color-border-secondary)"}`, background: hasRule ? "var(--color-background-danger)" : "var(--color-background-primary)", cursor: "pointer", whiteSpace: "nowrap", color: hasRule ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>
                            {hasRule ? "Clear rule" : "Add rule"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button onClick={goToValidate} style={{ padding: "8px 20px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 14, color: "var(--color-text-primary)" }}>
                Validate →
              </button>
            </div>
          )}

          {/* Step 3 — Validate & Edit */}
          {wStep === 3 && (
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
                  <div style={{ padding: "12px 14px", background: "#fff0f0", border: "0.5px solid #f5c6cb", borderRadius: "var(--border-radius-lg)", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: "#c0392b" }}>There are cells with errors.</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>You can fix them above, or certify below that you want to proceed anyway.</p>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, color: "#c0392b", fontWeight: 500 }}>
                      <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} style={{ width: 15, height: 15 }} />
                      Proceed anyway
                    </label>
                  </div>
                )}
                {!hasErrors && (
                  <div style={{ padding: "12px 14px", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", borderRadius: "var(--border-radius-lg)" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--color-text-success)" }}>No errors — all required fields are filled.</p>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setWStep(4)} disabled={!canProceed}
                    style={{ padding: "8px 20px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: canProceed ? "var(--color-background-primary)" : "var(--color-background-secondary)", cursor: canProceed ? "pointer" : "not-allowed", fontSize: 14, color: canProceed ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
                    Review & export →
                  </button>
                  <button onClick={() => setWStep(2)} style={{ padding: "8px 20px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 14, color: "var(--color-text-primary)" }}>
                    ← Back to mapping
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Export */}
          {wStep === 4 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{schemaType} — {mappedRows.length} rows ready</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Final review. Click any cell to make last edits, then download.</p>
                </div>
                <button onClick={handleExport} style={{ padding: "8px 18px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-success)", background: "var(--color-background-success)", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--color-text-success)", whiteSpace: "nowrap" }}>
                  Download CSV
                </button>
              </div>
              <ValidationSpreadsheet headers={mappedHeaders} rows={mappedRows} cellErrors={{}} allFields={allFields} onChange={setMappedRows} />
              <button onClick={reset} style={{ marginTop: "1.5rem", padding: "8px 18px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)" }}>
                Import another sheet
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 170, flexShrink: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Session history</p>
          {history.length === 0 ? <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No exports yet</p>
            : history.map((h, i) => (
              <div key={i} style={{ padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginBottom: 8, border: "0.5px solid var(--color-border-tertiary)" }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{h.type}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{h.rows} rows · {h.time}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}