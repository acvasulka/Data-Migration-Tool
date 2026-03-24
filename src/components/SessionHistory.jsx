import { C } from "../theme";

export default function SessionHistory({ history }) {
  return (
    <div style={{ width: 180, flexShrink: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Session History
      </p>
      {history.length === 0
        ? <p style={{ fontSize: 12, color: C.textLight }}>No exports yet</p>
        : history.map((h, i) => (
          <div key={i} className="fmx-history-card">
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: C.navy }}>{h.type}</p>
            <p style={{ margin: 0, fontSize: 11, color: C.textMid }}>{h.rows} rows · {h.time}</p>
          </div>
        ))
      }
    </div>
  );
}
