import { C } from "../theme";

export default function Modal({ width = 380, onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        style={{ width, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", maxHeight: "80vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
