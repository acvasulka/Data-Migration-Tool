import { useState, useRef } from "react";
import { C } from "../theme";

export default function ValidationSpreadsheet({ headers, rows, cellErrors, allFields, onChange }) {
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
          {errorCount > 0 && (
            <span style={{ fontSize: 12, padding: "4px 10px", background: C.errBg, color: C.errText, border: `1px solid ${C.errBorder}`, borderRadius: 6 }}>
              {errorCount} cell{errorCount > 1 ? "s" : ""} with errors (red)
            </span>
          )}
          {warnCount > 0 && (
            <span style={{ fontSize: 12, padding: "4px 10px", background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}`, borderRadius: 6 }}>
              {warnCount} cross-sheet warning{warnCount > 1 ? "s" : ""} (yellow)
            </span>
          )}
          <span style={{ fontSize: 12, color: C.textLight, padding: "4px 0" }}>Click any cell to edit inline</span>
        </div>
      )}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: (headers.length + 1) * CW }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: C.navy }}>
              <th style={{ width: 32, padding: "7px 8px", borderBottom: `1px solid ${C.border}`, borderRight: "1px solid rgba(255,255,255,0.15)" }}></th>
              {headers.map(h => {
                const f = allFields.find(f => f.name === h);
                return (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${C.border}`, borderRight: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap", width: CW, maxWidth: CW, overflow: "hidden", textOverflow: "ellipsis", color: C.white }}>
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
                          </div>
                      }
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
