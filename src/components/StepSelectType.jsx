import { C } from "../theme";
import { IMPORT_ORDER } from "../schemas";
import Badge from "./Badge";

export default function StepSelectType({ history, onSelectType }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
        Suggested import order: {IMPORT_ORDER.join(" → ")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
        {IMPORT_ORDER.map(type => (
          <button key={type} className="fmx-type-card" onClick={() => onSelectType(type)}>
            <span style={{ color: C.navy, fontWeight: 600 }}>{type}</span>
            {history.filter(h => h.type === type).length > 0 && (
              <Badge color="blue">
                {history.filter(h => h.type === type).reduce((a, b) => a + b.rows, 0)} rows exported
              </Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
