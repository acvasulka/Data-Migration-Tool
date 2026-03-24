import { C } from "../theme";

export default function StepUpload({ schemaType, aiLoading, dragOver, setDragOver, fileRef, handleFileAndMap }) {
  return (
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
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={e => handleFileAndMap(e.target.files[0])}
      />
      {aiLoading && (
        <p style={{ fontSize: 13, color: C.textMid, marginTop: 12 }}>Analyzing columns and suggesting mappings...</p>
      )}
    </div>
  );
}
