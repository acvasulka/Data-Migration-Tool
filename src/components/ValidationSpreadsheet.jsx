import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../theme";
import { getTooltipText } from "../fmxFieldTypes";

export default function ValidationSpreadsheet({
  headers,
  rows,
  rowGlobalIndices,  // number[] mapping localRi → globalRi; omit for legacy mode
  cellErrors,
  allFields,
  onChange,
  onRowRemove,       // (localRi) => void; if provided, used instead of inline filter
  onRowAdd,          // () => void; if provided, used instead of inline append
  focusCell,
  onDepColumnClick,
}) {
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [widths, setWidths] = useState(() => Object.fromEntries(headers.map(h => [h, 130])));
  const inputRef = useRef();
  const rowRefs = useRef({});
  const containerRef = useRef();

  // Sync widths when headers change (new columns added)
  useEffect(() => {
    setWidths(prev => {
      const next = { ...prev };
      headers.forEach(h => { if (next[h] == null) next[h] = 130; });
      return next;
    });
  }, [headers]);

  // Jump to a specific cell when focusCell changes
  // focusCell.ri is always a GLOBAL row index
  useEffect(() => {
    if (!focusCell) return;
    const { ri: globalRi, header } = focusCell;
    const localRi = rowGlobalIndices ? rowGlobalIndices.findIndex(g => g === globalRi) : globalRi;
    if (localRi < 0 || rows[localRi] == null) return; // not on this page
    setEditCell(`${localRi}-${header}`);
    setEditVal(rows[localRi][header] ?? "");
    setTimeout(() => {
      inputRef.current?.focus();
      rowRefs.current[localRi]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }, [focusCell]); // intentional — only trigger on focusCell identity change

  const startEdit = (ri, h, val) => {
    setEditCell(`${ri}-${h}`); setEditVal(val);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commit = (ri, h) => { onChange(rows.map((r, i) => i === ri ? { ...r, [h]: editVal } : r)); setEditCell(null); };
  const handleKey = (e, ri, h) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commit(ri, h); } if (e.key === "Escape") setEditCell(null); };

  const addRow = () => {
    if (onRowAdd) { onRowAdd(); }
    else { onChange([...rows, Object.fromEntries(headers.map(h => [h, ""]))]); }
  };
  const removeRow = ri => {
    if (onRowRemove) { onRowRemove(ri); }
    else { onChange(rows.filter((_, i) => i !== ri)); }
  };

  // Resolve cellErrors key using global index when available
  const getGlobalRi = ri => rowGlobalIndices ? rowGlobalIndices[ri] : ri;

  const getCellBg = (ri, h) => {
    const key = `${getGlobalRi(ri)}-${h}`;
    if (cellErrors[key] === "error") return C.errBg;
    if (cellErrors[key] === "dep_error") return C.warnBg;
    return ri % 2 === 0 ? C.white : C.bgPage;
  };
  const getCellColor = (ri, h) => {
    const key = `${getGlobalRi(ri)}-${h}`;
    if (cellErrors[key] === "error") return C.errText;
    if (cellErrors[key] === "dep_error") return C.warnText;
    return C.textDark;
  };

  // Count dep_errors per column header for the ⚠ badge (from full cellErrors map)
  const depErrorsByCol = {};
  Object.entries(cellErrors).forEach(([key, val]) => {
    if (val === "dep_error") {
      const h = key.slice(key.indexOf('-') + 1);
      depErrorsByCol[h] = (depErrorsByCol[h] || 0) + 1;
    }
  });

  const startResize = useCallback((e, h) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[h] || 130;
    const onMove = ev => {
      const w = Math.max(80, Math.min(400, startW + ev.clientX - startX));
      setWidths(prev => ({ ...prev, [h]: w }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [widths]);

  return (
    <div>
      <div ref={containerRef} style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", width: (headers.length + 1) * 130 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: C.navy }}>
              <th style={{ width: 32, minWidth: 32, padding: "7px 8px", borderBottom: `1px solid ${C.border}`, borderRight: "1px solid rgba(255,255,255,0.15)" }}></th>
              {headers.map(h => {
                const f = allFields?.find(f => f.name === h);
                const w = widths[h] || 130;
                const tooltip = getTooltipText(f);
                const depCount = depErrorsByCol[h] || 0;
                return (
                  <th key={h} title={tooltip || undefined} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${C.border}`, borderRight: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap", width: w, minWidth: w, overflow: "hidden", textOverflow: "ellipsis", color: C.white, position: "relative", userSelect: "none", cursor: tooltip ? 'help' : undefined }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h}{f?.required && <span style={{ color: C.blue }}> *</span>}
                        {f?.isCustomField && <span style={{ fontSize: 8, color: '#C4B5FD', marginLeft: 4, verticalAlign: 'super' }}>CF</span>}
                      </span>
                      {depCount > 0 && (
                        <span
                          onClick={e => { e.stopPropagation(); onDepColumnClick?.(h); }}
                          title={`${depCount} dependency mismatch${depCount !== 1 ? 'es' : ''} — click to fix`}
                          style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 5px',
                            background: C.warnBg, color: C.warnText,
                            border: `1px solid ${C.warnBorder}`, borderRadius: 4,
                            cursor: 'pointer', lineHeight: 1.4,
                          }}
                        >
                          ⚠ {depCount}
                        </span>
                      )}
                    </span>
                    {/* Resize handle */}
                    <div
                      onMouseDown={e => startResize(e, h)}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", background: "rgba(255,255,255,0.15)", zIndex: 1 }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} ref={el => rowRefs.current[ri] = el}>
                <td style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, textAlign: "center", background: C.bgPage, width: 32 }}>
                  <button onClick={() => removeRow(ri)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 14, padding: 0, transition: "color 0.15s ease" }}>×</button>
                </td>
                {headers.map(h => {
                  const gri = getGlobalRi(ri);
                  const key = `${gri}-${h}`, isEditing = editCell === `${ri}-${h}`;
                  const bg = getCellBg(ri, h), fg = getCellColor(ri, h);
                  const w = widths[h] || 130;
                  return (
                    <td key={h} style={{ padding: 0, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, width: w, maxWidth: w, background: bg }}>
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
