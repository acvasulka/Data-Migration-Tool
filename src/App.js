import { useState, useRef } from "react";

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

// ─── Brand tokens ────────────────────────────────────────────────────────────
const C = {
  orange:    "#CF4A12",
  orangeHov: "#b5420f",
  navy:      "#041662",
  blue:      "#66C8E3",
  white:     "#FFFFFF",
  bgPage:    "#F5F5F5",
  border:    "#E0E0E0",
  textDark:  "#444444",
  textMid:   "#717171",
  textLight: "#AAAAAA",
  navyTint:  "#EEF0F8",
  errBg:     "#FFF0F0",
  errText:   "#CF4A12",
  errBorder: "#FFCDD2",
  warnBg:    "#FFFBE6",
  warnText:  "#856404",
  warnBorder:"#FFE082",
  okBg:      "#E8F5E9",
  okText:    "#2E7D32",
  okBorder:  "#A5D6A7",
  blueBg:    "#E3F6FB",
  blueBorder:"#B2EBF2",
};

function Badge({ children, color = "gray" }) {
  const p = {
    gray:  [C.bgPage,   C.textMid,  C.border],
    green: [C.okBg,     C.okText,   C.okBorder],
    amber: [C.warnBg,   C.warnText, C.warnBorder],
    red:   [C.errBg,    C.errText,  C.errBorder],
    blue:  [C.blueBg,   C.blue,     C.blueBorder],
  };
  const [bg, fg, bd] = p[color] || p.gray;
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: bg, color: fg, border: `1px solid ${bd}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Modal({ width = 380, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ width, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function DataPreviewModal({ header, values, onClose }) {
  return (
    <Modal width={340} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.navy }}>"{header}" — sample values</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.textMid, lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      {values.length === 0
        ? <p style={{ fontSize: 12, color: C.textLight }}>No data found in this column.</p>
        : values.map((v, i) => (
          <div key={i} style={{ fontSize: 13, padding: "5px 8px", background: i % 2 === 0 ? C.bgPage : C.white, borderRadius: 4, color: v ? C.textDark : C.textLight }}>
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
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.navy }}>Transform rule — "{fieldName}"</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.textMid, lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: C.textMid, margin: "0 0 8px" }}>Describe what this field should contain in plain language:</p>
      <textarea
        className="fmx-textarea"
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder={`e.g. "Combine 'description' and 'type' with a dash. If only one exists, use that."`}
        style={{ minHeight: 72 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={generate} disabled={loading}>
          {loading ? "Generating..." : "Generate rule"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: C.errText, marginTop: 6 }}>{err}</p>}
      {code && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Generated rule (editable)</p>
          <textarea
            className="fmx-textarea"
            value={code}
            onChange={e => setCode(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 11, minHeight: 100 }}
          />
          <button className="fmx-btn-primary" style={{ marginTop: 8, fontSize: 12, padding: "6px 18px" }} onClick={() => onSave({ instruction, code })}>
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
    <div style={{ padding: "12px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.navy }}>Bulk edit in plain language</p>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: C.textMid }}>e.g. "Fill blank 'Type' fields with HVAC" or "Set Building to 'Main Campus' where it's empty"</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="fmx-input"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === "Enter" && apply()}
          placeholder="Describe what to change..."
          style={{ flex: 1 }}
        />
        <button className="fmx-btn-primary" style={{ fontSize: 13, padding: "6px 16px", whiteSpace: "nowrap" }} onClick={apply} disabled={loading}>
          {loading ? "Applying..." : "Apply"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: C.errText, marginTop: 6 }}>{err}</p>}
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
    if (cellErrors[key] === "error") return C.errBg;
    if (cellErrors[key] === "warning") return C.warnBg;
    return ri % 2 === 0 ? C.white : C.bgPage;
  };
  const getCellColor = (ri, h) => {
    const key = `${ri}-${h}`;
    if (cellErrors[key] === "error") return C.errText;
    if (cellErrors[key] === "warning") return C.warnText;
    return C.textDark;
  };

  const CW = 130;
  const errorCount = Object.values(cellErrors).filter(v => v === "error").length;
  const warnCount = Object.values(cellErrors).filter(v => v === "warning").length;

  return (
    <div>
      {(errorCount > 0 || warnCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          {errorCount > 0 && <span style={{ fontSize: 12, padding: "4px 10px", background: C.errBg, color: C.errText, border: `1px solid ${C.errBorder}`, borderRadius: 6 }}>{errorCount} cell{errorCount > 1 ? "s" : ""} with errors (red)</span>}
          {warnCount > 0 && <span style={{ fontSize: 12, padding: "4px 10px", background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}`, borderRadius: 6 }}>{warnCount} cross-sheet warning{warnCount > 1 ? "s" : ""} (yellow)</span>}
          <span style={{ fontSize: 12, color: C.textLight, padding: "4px 0" }}>Click any cell to edit inline</span>
        </div>
      )}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: (headers.length + 1) * CW }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: C.navy }}>
              <th style={{ width: 32, padding: "7px 8px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid rgba(255,255,255,0.15)` }}></th>
              {headers.map(h => {
                const f = allFields.find(f => f.name === h);
                return (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid rgba(255,255,255,0.15)`, whiteSpace: "nowrap", width: CW, maxWidth: CW, overflow: "hidden", textOverflow: "ellipsis", color: C.white }}>
                    {h}{f?.required && <span style={{ color: C.blue }}> *</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, textAlign: "center", background: C.bgPage }}>
                  <button onClick={() => removeRow(ri)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 14, padding: 0, transition: "color 0.15s ease" }}>×</button>
                </td>
                {headers.map(h => {
                  const key = `${ri}-${h}`, isEditing = editCell === key;
                  const bg = getCellBg(ri, h), fg = getCellColor(ri, h);
                  return (
                    <td key={h} style={{ padding: 0, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, width: CW, maxWidth: CW, background: bg }}>
                      {isEditing
                        ? <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commit(ri, h)} onKeyDown={e => handleKey(e, ri, h)}
                            style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", fontSize: 12, border: "none", outline: `2px solid ${C.blue}`, background: C.white, color: C.textDark, borderRadius: 0, fontFamily: "inherit" }} />
                        : <div onClick={() => startEdit(ri, h, row[h] ?? "")}
                            style={{ padding: "5px 8px", minHeight: 28, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row[h] ? fg : C.textLight, fontWeight: cellErrors[key] ? 500 : 400 }}>
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
      <button className="fmx-btn-secondary" style={{ marginTop: 8, fontSize: 12, padding: "5px 14px" }} onClick={addRow}>+ Add row</button>
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
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPage, minHeight: "100vh", color: C.textDark }}>
      <style>{`
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
        .fmx-section-label {
          font-size: 11px; font-weight: 600; color: ${C.navy};
          text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;
        }
        .fmx-history-card {
          padding: 8px 10px; background: ${C.white}; border-radius: 6px;
          margin-bottom: 8px; border: 1px solid ${C.border};
          border-left: 3px solid ${C.blue};
        }
      `}</style>

      {/* Modals */}
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

            {/* Step 0 — Select Type */}
            {wStep === 0 && (
              <div>
                <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>Suggested import order: {IMPORT_ORDER.join(" → ")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                  {IMPORT_ORDER.map(type => (
                    <button key={type} className="fmx-type-card" onClick={() => handleSelectType(type)}>
                      <span style={{ color: C.navy, fontWeight: 600 }}>{type}</span>
                      {history.filter(h => h.type === type).length > 0 && (
                        <Badge color="blue">{history.filter(h => h.type === type).reduce((a, b) => a + b.rows, 0)} rows exported</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1 — Upload CSV */}
            {wStep === 1 && (
              <div>
                <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
                  Importing into: <strong style={{ color: C.navy }}>{schemaType}</strong>
                </p>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFileAndMap(e.dataTransfer.files[0]); }}
                  onClick={() => fileRef.current.click()}
                  style={{
                    border: `2px dashed ${dragOver ? C.blue : C.border}`,
                    borderRadius: 8, padding: "2.5rem 2rem", textAlign: "center", cursor: "pointer",
                    background: dragOver ? C.navyTint : C.white,
                    transition: "all 0.15s ease",
                  }}
                >
                  <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: C.navy }}>Drag & drop CSV here</p>
                  <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>or click to browse</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFileAndMap(e.target.files[0])} />
                {aiLoading && <p style={{ fontSize: 13, color: C.textMid, marginTop: 12 }}>Analyzing columns and suggesting mappings...</p>}
              </div>
            )}

            {/* Step 2 — Map Fields */}
            {wStep === 2 && schema && (
              <div>
                <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
                  <strong style={{ color: C.navy }}>{csv.rows.length} rows</strong> · <strong style={{ color: C.navy }}>{csv.headers.length} columns</strong> detected. Map CSV columns to FMX fields. <span style={{ color: C.orange }}>*</span> = required.
                </p>

                {(schemaType === "Building" || schemaType === "Resource") && (
                  <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: C.white, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <p className="fmx-section-label">Custom fields</p>
                    {customFields.map((cf, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                          className="fmx-input"
                          value={cf}
                          onChange={e => setCustomFields(fs => fs.map((f, j) => j === i ? e.target.value : f))}
                          placeholder="Custom field name"
                          style={{ flex: 1 }}
                        />
                        <button className="fmx-btn-destructive" onClick={() => setCustomFields(fs => fs.filter((_, j) => j !== i))}>Remove</button>
                      </div>
                    ))}
                    <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setCustomFields(fs => [...fs, ""])}>+ Add custom field</button>
                  </div>
                )}

                {schemaType === "Resource" && (
                  <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: C.white, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <p className="fmx-section-label">Scheduling rate buckets</p>
                    {dynamicRates.map((_, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: C.textDark, minWidth: 60 }}>Rate {i + 1}</span>
                        <span style={{ fontSize: 12, color: C.textMid }}>Cost + Unit</span>
                        <button className="fmx-btn-destructive" onClick={() => setDynamicRates(r => r.filter((_, j) => j !== i))} style={{ marginLeft: "auto" }}>Remove</button>
                      </div>
                    ))}
                    <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setDynamicRates(r => [...r, ""])}>+ Add rate bucket</button>
                  </div>
                )}

                {Object.entries(groupedFields).map(([group, fields]) => (
                  <div key={group} style={{ marginBottom: "1.5rem" }}>
                    <p className="fmx-section-label">{group}</p>
                    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                      {fields.map((f, i) => {
                        const hasRule = !!transformRules[f.name], mappedCol = mapping[f.name];
                        return (
                          <div
                            key={f.name}
                            style={{
                              display: "grid", gridTemplateColumns: "180px 16px 1fr auto auto",
                              alignItems: "center", gap: 8, padding: "7px 12px",
                              borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : "none",
                              background: hasRule ? C.navyTint : i % 2 === 0 ? C.white : C.bgPage,
                            }}
                          >
                            <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textDark }}>
                              {f.name}{f.required && <span style={{ color: C.orange }}> *</span>}
                              {f.crossSheet && <span style={{ fontSize: 10, color: C.blue, marginLeft: 5 }}>→{f.crossSheet}</span>}
                            </div>
                            <div style={{ textAlign: "center", color: C.textLight, fontSize: 12 }}>→</div>
                            {hasRule
                              ? <span style={{ fontSize: 12, color: C.blue, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Rule: {transformRules[f.name].instruction}</span>
                              : <select className="fmx-select" value={mappedCol ?? ""} onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value || undefined }))}>
                                  <option value="">— skip —</option>
                                  {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            }
                            {mappedCol && !hasRule && (
                              <button className="fmx-btn-xs" onClick={() => setPreview({ header: mappedCol, values: getColPreview(mappedCol) })}>
                                View data
                              </button>
                            )}
                            <button
                              className={`fmx-btn-xs-rule${hasRule ? " active" : ""}`}
                              onClick={() => hasRule
                                ? setTransformRules(r => { const n = { ...r }; delete n[f.name]; return n; })
                                : setTransformModal(f.name)
                              }
                            >
                              {hasRule ? "Clear rule" : "Add rule"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button className="fmx-btn-primary" onClick={goToValidate}>Validate →</button>
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
            )}

            {/* Step 4 — Export */}
            {wStep === 4 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.navy }}>{schemaType} — {mappedRows.length} rows ready</p>
                    <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Final review. Click any cell to make last edits, then download.</p>
                  </div>
                  <button className="fmx-btn-primary" onClick={handleExport}>Download CSV</button>
                </div>
                <ValidationSpreadsheet headers={mappedHeaders} rows={mappedRows} cellErrors={{}} allFields={allFields} onChange={setMappedRows} />
                <button className="fmx-btn-secondary" onClick={reset} style={{ marginTop: "1.5rem" }}>Import another sheet</button>
              </div>
            )}
          </div>

          {/* Session history sidebar */}
          <div style={{ width: 180, flexShrink: 0 }}>
            <p className="fmx-section-label">Session History</p>
            {history.length === 0
              ? <p style={{ fontSize: 12, color: C.textLight }}>No exports yet</p>
              : history.map((h, i) => (
                <div key={i} className="fmx-history-card">
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: C.navy }}>{h.type}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.textMid }}>{h.rows} rows · {h.time}</p>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
