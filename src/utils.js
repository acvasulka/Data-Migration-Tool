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

export function computeCellErrors(rows, allFields, importedData, getOptionsData) {
  const cellMap = {};

  // Pre-build valid-name sets from get-options for lookup fields
  const validNamesCache = {};
  if (getOptionsData) {
    for (const f of allFields) {
      if (f.isLookupField && f.lookupConfig?.getOptionsKey) {
        const optionsMap = getOptionsData[f.lookupConfig.getOptionsKey];
        if (optionsMap && typeof optionsMap === 'object') {
          validNamesCache[f.name] = new Set(Object.values(optionsMap).map(v => String(v).toLowerCase()));
        }
      }
    }
  }

  allFields.forEach(f => {
    rows.forEach((row, ri) => {
      const val = row[f.name] ?? "";
      const key = `${ri}-${f.name}`;

      // Custom field validation
      if (f.isCustomField) {
        if (!val) return;
        // Validate dropdown options for custom fields
        if (f.options && f.options.length > 0 && val) {
          const lowerVal = String(val).toLowerCase();
          const match = f.options.some(o => String(o).toLowerCase() === lowerVal);
          if (!match) { cellMap[key] = "warning"; }
        }
        return;
      }

      // Required check
      if (f.required && !val) { cellMap[key] = "error"; return; }
      if (!val) return;

      // Type checks
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { cellMap[key] = "error"; return; }
      if (f.type === "date" && isNaN(Date.parse(val))) { cellMap[key] = "error"; return; }
      if (f.type === "number" && isNaN(Number(val))) { cellMap[key] = "error"; return; }

      // Min/max length validation
      if (f.maxLength && String(val).length > f.maxLength) { cellMap[key] = "error"; return; }
      if (f.minLength && String(val).length < f.minLength) { cellMap[key] = "error"; return; }

      // Min/max value validation for numbers
      if (f.type === "number" && !isNaN(Number(val))) {
        const num = Number(val);
        if (f.maxValue != null && num > f.maxValue) { cellMap[key] = "error"; return; }
        if (f.minValue != null && num < f.minValue) { cellMap[key] = "error"; return; }
      }

      // System field dropdown options validation
      if (f.options && f.options.length > 0) {
        const lowerVal = String(val).toLowerCase();
        const match = f.options.some(o => String(o).toLowerCase() === lowerVal);
        if (!match) { cellMap[key] = "warning"; return; }
      }

      // Lookup field validation against get-options data
      if (f.isLookupField && validNamesCache[f.name]) {
        const lowerVal = String(val).toLowerCase();
        if (!validNamesCache[f.name].has(lowerVal)) {
          // Also check cross-sheet data (in-session imports)
          if (f.crossSheet && importedData[f.crossSheet] && importedData[f.crossSheet].includes(val)) {
            return; // Found in cross-sheet data — OK
          }
          cellMap[key] = "dep_error";
          return;
        }
      }

      // Cross-sheet validation (fallback for non-lookup fields or when get-options unavailable)
      if (f.crossSheet && importedData[f.crossSheet] && !importedData[f.crossSheet].includes(val)) {
        if (!validNamesCache[f.name]) {
          cellMap[key] = "warning";
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
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(toCSV(headers, rows));
  a.download = filename; a.click();
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
