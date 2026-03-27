import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../theme";
import { getTooltipText } from "../fmxFieldTypes";

export default function ValidationSpreadsheet({
  headers,
  rows,
  rowGlobalIndices,      // number[] mapping localRi → globalRi
  cellErrors,
  allFields,
  onChange,
  onRowRemove,           // (localRi) => void
  onRowAdd,              // () => void
  focusCell,
  onDepColumnClick,
  columnFilters,         // { [col]: string[] } — active filters
  onColumnFilterChange,  // (col, values: string[]) => void
  colUniqueValues,       // { [col]: string[] } — unique values from full dataset
}) {
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [widths, setWidths] = useState(() => Object.fromEntries(headers.map(h => [h, 130])));
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const inputRef = useRef();
  const rowRefs = useRef({});
  const containerRef = useRef();
  const headerRefs = useRef({});
  const filterDropdownRef = useRef();

  // Sync widths when headers change
  useEffect(() => {
    setWidths(prev => {
      const next = { ...prev };
      headers.forEach(h => { if (next[h] == null) next[h] = 130; });
      return next;
    });
  }, [headers]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!openFilterCol) return;
    const handler = (e) => {
      if (
        filterDropdownRef.current && !filterDropdownRef.current.contains(e.target) &&
        !Object.values(headerRefs.current).some(el => el && el.contains(e.target))
      ) {
        setOpenFilterCol(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilterCol]);

  // Jump to a specific cell when focusCell changes — focusCell.ri is always a GLOBAL index
  useEffect(() => {
    if (!focusCell) return;
    const { ri: globalRi, header } = focusCell;
    const localRi = rowGlobalIndices ? rowGlobalIndices.findIndex(g => g === globalRi) : globalRi;
    if (localRi < 0 || rows[localRi] == null) return;
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
  const handleKey = (e, ri, h) => {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commit(ri, h); }
    if (e.key === "Escape") setEditCell(null);
  };

  const addRow = () => {
    if (onRowAdd) { onRowAdd(); }
    else { onChange([...rows, Object.fromEntries(headers.map(h => [h, ""]))]); }
  };
  const removeRow = ri => {
    if (onRowRemove) { onRowRemove(ri); }
    else { onChange(rows.filter((_, i) => i !== ri)); }
  };

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

  // Filter dropdown for the open column
  const renderFilterDropdown = () => {
    if (!openFilterCol || !onColumnFilterChange) return null;
    const rect = headerRefs.current[openFilterCol]?.getBoundingClientRect();
    if (!rect) return null;
    const allVals = colUniqueValues?.[openFilterCol] || [];
    const active = new Set(columnFilters?.[openFilterCol] || []);
    const q = filterSearch.toLowerCase();
    const displayed = q ? allVals.filter(v => v.toLowerCase().includes(q)) : allVals;

    return (
      <div
        ref={filterDropdownRef}
        style={{
          position: 'fixed',
          top: rect.bottom + 2,
          left: rect.left,
          width: Math.max(rect.width, 230),
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
          zIndex: 300,
          overflow: 'hidden',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Search within dropdown */}
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
          <input
            className="fmx-input"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
            placeholder="Search values…"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            autoFocus
          />
        </div>
        {/* Values list */}
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {displayed.length === 0 && (
            <p style={{ fontSize: 12, color: C.textLight, padding: '10px 12px', margin: 0, fontStyle: 'italic' }}>No matching values</p>
          )}
          {displayed.map(v => (
            <label
              key={v}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: C.textDark, transition: 'background 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgPage; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; }}
            >
              <input
                type="checkbox"
                checked={active.has(v)}
                onChange={e => {
                  const next = new Set(active);
                  e.target.checked ? next.add(v) : next.delete(v);
                  onColumnFilterChange(openFilterCol, [...next]);
                }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v === '(blank)'
                  ? <em style={{ color: C.textLight }}>(blank)</em>
                  : v}
              </span>
            </label>
          ))}
        </div>
        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderTop: `1px solid ${C.border}`, background: C.bgPage }}>
          <button
            className="fmx-btn-xs"
            onClick={() => onColumnFilterChange(openFilterCol, [])}
          >
            Clear
          </button>
          <span style={{ fontSize: 11, color: C.textMid }}>
            {active.size > 0 ? `${active.size} selected` : 'All values'}
          </span>
          <button
            className="fmx-btn-xs"
            style={{ color: C.navy, borderColor: C.navy }}
            onClick={() => setOpenFilterCol(null)}
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
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
                const isFiltered = (columnFilters?.[h] || []).length > 0;
                const filterCount = (columnFilters?.[h] || []).length;
                return (
                  <th
                    key={h}
                    ref={el => headerRefs.current[h] = el}
                    title={tooltip || undefined}
                    style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${C.border}`, borderRight: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap", width: w, minWidth: w, overflow: "hidden", textOverflow: "ellipsis", color: C.white, position: "relative", userSelect: "none", cursor: tooltip ? 'help' : undefined }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                        {h}{f?.required && <span style={{ color: C.blue }}> *</span>}
                        {f?.isCustomField && <span style={{ fontSize: 8, color: '#C4B5FD', marginLeft: 4, verticalAlign: 'super' }}>CF</span>}
                      </span>
                      {/* Dep error badge */}
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
                      {/* Column filter toggle */}
                      {onColumnFilterChange && (
                        <span
                          onClick={e => {
                            e.stopPropagation();
                            setOpenFilterCol(openFilterCol === h ? null : h);
                            setFilterSearch('');
                          }}
                          title={isFiltered ? `Filter active: ${filterCount} value${filterCount !== 1 ? 's' : ''} selected` : 'Filter column'}
                          style={{
                            flexShrink: 0, fontSize: 9, padding: '2px 5px',
                            background: isFiltered ? '#fff' : 'rgba(255,255,255,0.18)',
                            color: isFiltered ? C.navy : 'rgba(255,255,255,0.75)',
                            borderRadius: 4, cursor: 'pointer', lineHeight: 1.4,
                            fontWeight: isFiltered ? 700 : 400,
                            transition: 'all 0.15s ease',
                            border: isFiltered ? `1px solid rgba(255,255,255,0.5)` : '1px solid transparent',
                          }}
                        >
                          {isFiltered ? `▼ ${filterCount}` : '▼'}
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
                  <button onClick={() => removeRow(ri)} title="Remove row" style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 14, padding: 0, lineHeight: 1, transition: "color 0.15s ease" }}
                    onMouseEnter={e => e.currentTarget.style.color = C.errText}
                    onMouseLeave={e => e.currentTarget.style.color = C.textLight}
                  >×</button>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} style={{ padding: '20px', textAlign: 'center', color: C.textLight, fontSize: 12, fontStyle: 'italic' }}>
                  No rows match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="fmx-btn-xs" style={{ marginTop: 8 }} onClick={addRow}>+ Add row</button>

      {/* Column filter dropdown — rendered outside table scroll container */}
      {renderFilterDropdown()}
    </div>
  );
}
