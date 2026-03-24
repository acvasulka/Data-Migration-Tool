import { C } from "../theme";
import Modal from "./Modal";

export default function DataPreviewModal({ header, values, onClose }) {
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
        ))
      }
    </Modal>
  );
}
