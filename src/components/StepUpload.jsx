import { C } from "../theme";
import RawSpreadsheet from "./RawSpreadsheet";

export default function StepUpload({ schemaType, aiLoading, fileInfo, dragOver, setDragOver, fileRef, handleFileAndMap, fmxSyncLoading, fmxSyncFromCache, xlsxSheetNames, onSheetSelect, csv, setCsv }) {

  const handleHeaderRename = (oldName, newName) => {
    setCsv(prev => ({
      headers: prev.headers.map(h => h === oldName ? newName : h),
      rows: prev.rows.map(row => {
        const updated = { ...row };
        updated[newName] = updated[oldName];
        delete updated[oldName];
        return updated;
      }),
    }));
  };

  const handleCellEdit = (rowIdx, header, value) => {
    setCsv(prev => ({
      ...prev,
      rows: prev.rows.map((row, i) => i === rowIdx ? { ...row, [header]: value } : row),
    }));
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
        Importing into: <strong style={{ color: C.navy }}>{schemaType}</strong>
      </p>

      {/* Drag-and-drop zone — compact when file already loaded */}
      {!csv ? (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileAndMap(e.dataTransfer.files[0]); }}
            onClick={() => !xlsxSheetNames && fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? C.blue : C.border}`,
              borderRadius: 8, padding: "2.5rem 2rem", textAlign: "center",
              cursor: xlsxSheetNames ? "default" : "pointer",
              background: dragOver ? C.navyTint : C.white,
              transition: "all 0.15s ease",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: C.navy }}>Drag & drop a spreadsheet here</p>
            <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>Supports CSV, Excel (.xlsx, .xls), and ODS · or click to browse</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.ods"
            style={{ display: "none" }}
            onChange={e => handleFileAndMap(e.target.files[0])}
          />
          {xlsxSheetNames && (
            <div style={{ marginTop: 16, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.navy, margin: '0 0 10px' }}>
                This file has multiple sheets. Select one to import:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {xlsxSheetNames.map(name => (
                  <button key={name} className="fmx-btn-secondary" style={{ textAlign: 'left' }}
                    onClick={() => onSheetSelect(name)}>
                    {name}
                  </button>
                ))}
                <button className="fmx-btn-secondary" style={{ textAlign: 'left', color: C.textMid }}
                  onClick={() => onSheetSelect('__merge__')}>
                  — Merge all sheets —
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* File info bar + replace option */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 8, marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, color: C.textMid }}>
              <strong style={{ color: C.navy }}>{csv.rows.length} rows</strong>
              {" · "}
              <strong style={{ color: C.navy }}>{csv.headers.length} columns</strong>
              {fileInfo && fileInfo.type !== "CSV" && (
                <> · {fileInfo.type}{fileInfo.sheetName ? ` · Sheet: '${fileInfo.sheetName}'` : ""}</>
              )}
            </div>
            <button
              className="fmx-btn-xs"
              onClick={() => fileRef.current.click()}
            >
              Replace file
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.ods"
            style={{ display: "none" }}
            onChange={e => handleFileAndMap(e.target.files[0])}
          />

          {/* Spreadsheet preview */}
          <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 8px', fontStyle: 'italic' }}>
            Review your data below. Click any header to rename it — updated names will be used for column mapping suggestions.
          </p>
          <RawSpreadsheet
            headers={csv.headers}
            rows={csv.rows}
            onHeaderRename={handleHeaderRename}
            onCellEdit={handleCellEdit}
          />
        </>
      )}

      {aiLoading && (
        <div style={{ marginTop: 12 }}>
          {fileInfo && (
            <p style={{ fontSize: 12, color: C.textMid, margin: "0 0 4px" }}>
              Detected: <strong>{fileInfo.type}</strong>
              {fileInfo.sheetName && <> · Sheet: '<strong>{fileInfo.sheetName}</strong>'</>}
              {fileInfo.rowCount != null && <> · {fileInfo.rowCount} rows</>}
            </p>
          )}
          <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>Analyzing columns and suggesting mappings...</p>
        </div>
      )}
      {fmxSyncLoading && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.textLight, fontStyle: "italic" }}>
          Syncing FMX custom fields…
        </p>
      )}
      {!fmxSyncLoading && fmxSyncFromCache === false && fmxSyncFromCache !== undefined && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.textLight, fontStyle: "italic" }}>
          FMX custom fields loaded
        </p>
      )}
      {fmxSyncFromCache === true && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.textLight, fontStyle: "italic" }}>
          FMX custom fields loaded (cached)
        </p>
      )}
    </div>
  );
}
