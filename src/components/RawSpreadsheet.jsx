import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../theme";

const PAGE_SIZE = 100;

export default function RawSpreadsheet({ headers, rows, onHeaderRename, onCellEdit }) {
  const [editCell, setEditCell] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [editHeader, setEditHeader] = useState(null);
  const [editHeaderVal, setEditHeaderVal] = useState("");
  const [widths, setWidths] = useState(() => Object.fromEntries(headers.map(h => [h, 140])));
  const [page, setPage] = useState(0);
  const inputRef = useRef();
  const headerInputRef = useRef();

  // Sync widths when headers change
  useEffect(() => {
    setWidths(prev => {
      const next = { ...prev };
      headers.forEach(h => { if (next[h] == null) next[h] = 140; });
      return next;
    });
  }, [headers]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Cell editing
  const startEdit = (ri, h, val) => {
    setEditCell(`${ri}-${h}`);
    setEditVal(val);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commitCell = (ri, h) => {
    const globalIdx = page * PAGE_SIZE + ri;
    onCellEdit(globalIdx, h, editVal);
    setEditCell(null);
  };
  const handleCellKey = (e, ri, h) => {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitCell(ri, h); }
    if (e.key === "Escape") setEditCell(null);
  };

  // Header editing
  const startHeaderEdit = (h) => {
    setEditHeader(h);
    setEditHeaderVal(h);
    setTimeout(() => headerInputRef.current?.focus(), 0);
  };
  const commitHeader = () => {
    const trimmed = editHeaderVal.trim();
    if (trimmed && trimmed !== editHeader && !headers.includes(trimmed)) {
      onHeaderRename(editHeader, trimmed);
    }
    setEditHeader(null);
  };
  const handleHeaderKey = (e) => {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitHeader(); }
    if (e.key === "Escape") setEditHeader(null);
  };

  // Column resize
  const startResize = useCallback((e, h) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[h] || 140;
    const onMove = ev => {
      const w = Math.max(80, Math.min(500, startW + ev.clientX - startX));
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
      <div style={{ overflowX: 'auto', maxHeight: 440, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr style={{ background: '#F3F4F6' }}>
              <th style={{ width: 40, padding: '6px 4px', fontSize: 10, color: '#9CA3AF', borderBottom: `1px solid ${C.border}`, textAlign: 'center', position: 'sticky', left: 0, background: '#F3F4F6', zIndex: 3 }}>#</th>
              {headers.map(h => (
                <th key={h} style={{ width: widths[h] || 140, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: C.navy, borderBottom: `1px solid ${C.border}`, textAlign: 'left', position: 'relative', whiteSpace: 'nowrap' }}>
                  {editHeader === h ? (
                    <input
                      ref={headerInputRef}
                      value={editHeaderVal}
                      onChange={e => setEditHeaderVal(e.target.value)}
                      onBlur={commitHeader}
                      onKeyDown={handleHeaderKey}
                      style={{ fontSize: 12, fontWeight: 600, color: C.navy, border: `1px solid ${C.orange}`, borderRadius: 3, padding: '2px 4px', width: '90%', background: '#FFF8F0', outline: 'none' }}
                    />
                  ) : (
                    <span
                      onClick={() => startHeaderEdit(h)}
                      title="Click to rename"
                      style={{ cursor: 'text', borderBottom: '1px dashed #D1D5DB', paddingBottom: 1 }}
                    >
                      {h}
                    </span>
                  )}
                  {/* Resize handle */}
                  <div
                    onMouseDown={e => startResize(e, h)}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', background: 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#D1D5DB'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? C.white : C.bgPage }}>
                <td style={{ padding: '4px 4px', fontSize: 10, color: '#9CA3AF', textAlign: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', left: 0, background: ri % 2 === 0 ? C.white : C.bgPage, zIndex: 1 }}>
                  {page * PAGE_SIZE + ri + 1}
                </td>
                {headers.map(h => {
                  const isEditing = editCell === `${ri}-${h}`;
                  const val = row[h] ?? "";
                  return (
                    <td key={h} style={{ width: widths[h] || 140, padding: 0, borderBottom: `1px solid ${C.border}` }}>
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={() => commitCell(ri, h)}
                          onKeyDown={e => handleCellKey(e, ri, h)}
                          style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: 'none', outline: `2px solid ${C.blue}`, boxSizing: 'border-box', background: '#EFF6FF' }}
                        />
                      ) : (
                        <div
                          onClick={() => startEdit(ri, h, val)}
                          style={{ padding: '4px 6px', fontSize: 12, color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', minHeight: 22 }}
                        >
                          {val}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: C.textMid }}>
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length} rows
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="fmx-btn-xs"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >← Prev</button>
            <button
              className="fmx-btn-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
