import { useState, useRef as useReactRef } from "react";
import { C } from "../theme";
import RawSpreadsheet from "./RawSpreadsheet";
import { recordCorrections } from "../db";

export default function StepUpload({ schemaType, aiLoading, fileInfo, dragOver, setDragOver, fileRef, handleFileAndMap, fmxSyncLoading, fmxSyncFromCache, xlsxSheetNames, onSheetSelect, csv, setCsv, pdfExtracting, pdfProgress, pdfSource, currentUserId }) {

  // Small, non-intrusive feedback: shows after the first correction in a session,
  // then silent-counts subsequent ones so users aren't bombarded.
  const [correctionCount, setCorrectionCount] = useState(0);
  const toastTimerRef = useReactRef(null);

  // When the csv came from a PDF extraction, every edit in this preview is
  // strong signal that Claude got something wrong. Fire-and-forget record it
  // so admins can later review patterns and promote fixes into few-shot examples.
  const logCorrection = (entry) => {
    if (!pdfSource?.runId) return;
    recordCorrections({
      extractionRunId: pdfSource.runId,
      migrationType: pdfSource.migrationType,
      userId: currentUserId,
      entries: [entry],
    });
    setCorrectionCount(n => n + 1);
    // Debounced auto-hide: resets on every new edit so the toast shows one
    // unified count instead of flickering per keystroke.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setCorrectionCount(0), 4000);
  };

  const handleHeaderRename = (oldName, newName) => {
    if (pdfSource?.runId && oldName !== newName) {
      logCorrection({
        correctionType: 'header_rename',
        fieldPath: oldName,
        originalValue: oldName,
        correctedValue: newName,
      });
    }
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
    if (pdfSource?.runId) {
      const prevVal = csv?.rows?.[rowIdx]?.[header] ?? '';
      if (String(prevVal) !== String(value)) {
        logCorrection({
          correctionType: 'cell_edit',
          fieldPath: header,
          rowIndex: rowIdx,
          originalValue: String(prevVal),
          correctedValue: String(value),
        });
      }
    }
    setCsv(prev => ({
      ...prev,
      rows: prev.rows.map((row, i) => i === rowIdx ? { ...row, [header]: value } : row),
    }));
  };

  return (
    <div style={{ position: "relative" }}>
      {correctionCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 20, bottom: 20,
            padding: "10px 14px",
            borderRadius: 8,
            background: C.navy,
            color: "#fff",
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            fontSize: 12, lineHeight: 1.4,
            maxWidth: 320,
            zIndex: 200,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {correctionCount === 1 ? "Correction recorded" : `${correctionCount} corrections recorded`}
          </div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            Your edits help improve future PDF extractions.
          </div>
        </div>
      )}
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
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: C.navy }}>Drag & drop a spreadsheet or PDF here</p>
            <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>CSV, Excel (.xlsx, .xls), ODS, or PDF (OCR) · or click to browse</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.ods,.pdf"
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
            accept=".csv,.xlsx,.xls,.ods,.pdf"
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

      {pdfExtracting && (
        <div style={{ marginTop: 12, padding: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: C.navyTint }}>
          <p style={{ fontSize: 13, color: C.navy, margin: "0 0 4px", fontWeight: 600 }}>
            Extracting fields from PDF…
          </p>
          <p style={{ fontSize: 12, color: C.textMid, margin: 0 }}>
            {pdfProgress?.label || "Working…"}
            {pdfProgress?.current != null && pdfProgress?.total != null && (
              <> — {pdfProgress.current}/{pdfProgress.total}</>
            )}
          </p>
        </div>
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
