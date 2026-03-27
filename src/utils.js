export function parseCSV(raw) {
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

export function buildMappedRows(rows, mapping, transformRules, allFields) {
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

// depCacheMap: { [crossSheetType]: string[] } — live FMX names keyed by crossSheet label.
// schemaType: the current import type (e.g. "Building", "Equipment") — its own type is excluded
//             from dependency validation so a Building import doesn't flag Building fields.
export function computeCellErrors(rows, allFields, schemaType, depCacheMap) {
  // Strip module qualifier: "Work Request:maintenance" → "Work Request"
  const skipCrossSheet = schemaType
    ? (schemaType.indexOf(':') === -1 ? schemaType : schemaType.slice(0, schemaType.indexOf(':')))
    : null;

  const cellMap = {};
  allFields.forEach(f => {
    rows.forEach((row, ri) => {
      const val = row[f.name] ?? "";
      const key = `${ri}-${f.name}`;
      if (f.isCustomField) return;
      if (f.required && !val) { cellMap[key] = "error"; return; }
      if (!val) return;
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { cellMap[key] = "error"; return; }
      if (f.type === "date" && isNaN(Date.parse(val))) { cellMap[key] = "error"; return; }
      if (f.type === "number" && isNaN(Number(val))) { cellMap[key] = "error"; return; }
      if (f.maximumLength && String(val).length > f.maximumLength) { cellMap[key] = "warning"; return; }
      // Dependency error: crossSheet field whose value doesn't appear in FMX live cache.
      // Skipped for the import's own entity type (e.g. Building import won't flag Building fields).
      if (f.crossSheet && f.crossSheet !== skipCrossSheet) {
        const validNames = depCacheMap?.[f.crossSheet];
        if (validNames && validNames.length > 0 && !validNames.includes(val)) {
          cellMap[key] = "dep_error";
        }
      }
    });
  });
  return cellMap;
}

export function toCSV(headers, rows) {
  const esc = v => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.map(esc).join(","), ...rows.map(r => headers.map(h => esc(r[h] ?? "")).join(","))].join("\n");
}

export function downloadCSV(filename, headers, rows) {
  const blob = new Blob([toCSV(headers, rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function suggestMapping(headers, fields) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {};
  fields.forEach(f => {
    const m = headers.find(h => norm(h) === norm(f.name) || norm(h).includes(norm(f.name)) || norm(f.name).includes(norm(h)));
    if (m) map[f.name] = m;
  });
  return map;
}
