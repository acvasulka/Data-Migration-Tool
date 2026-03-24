import { useState } from "react";
import { C } from "../theme";
import { IMPORT_ORDER, FMX_SCHEMAS } from "../schemas";

const DEPS = {
  Building:         "No dependencies",
  Resource:         "Requires: Building",
  User:             "Requires: Building",
  "Equipment Type": "No dependencies",
  Equipment:        "Requires: Building + Equipment Type",
  Inventory:        "Requires: Building",
};

export default function StepSelectType({ history, onSelectType }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ maxWidth: 600 }}>
      {IMPORT_ORDER.map((type, idx) => {
        const isHovered = hovered === type;
        const exportedRows = history.filter(h => h.type === type).reduce((a, b) => a + b.rows, 0);
        const wasExported = exportedRows > 0;
        const fieldCount = FMX_SCHEMAS[type].fields.length;

        return (
          <div key={type}>
            <div
              onClick={() => onSelectType(type)}
              onMouseEnter={() => setHovered(type)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "14px 16px", cursor: "pointer",
                background: isHovered ? C.navyTint : C.white,
                borderLeft: isHovered ? `3px solid ${C.orange}` : "3px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {/* Step number circle */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: C.navy, color: C.white,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {idx + 1}
              </div>

              {/* Type name + dependency */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, lineHeight: 1.3 }}>{type}</div>
                <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{DEPS[type]}</div>
              </div>

              {/* Right: field count + export badge + arrow */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: C.textMid, whiteSpace: "nowrap" }}>{fieldCount} fields</span>
                {wasExported && (
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4,
                    background: C.okBg, color: C.okText, border: `1px solid ${C.okBorder}`,
                    whiteSpace: "nowrap",
                  }}>
                    ✓ exported
                  </span>
                )}
                <span style={{ color: C.textMid, fontSize: 16 }}>→</span>
              </div>
            </div>
            {idx < IMPORT_ORDER.length - 1 && (
              <div style={{ height: 1, background: C.border, marginLeft: 60 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
