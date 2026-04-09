import { useState } from "react";
import { C } from "../theme";
import { getImportOrder, getBaseSchemaType, getSchemaDisplayName } from "../schemas";
import { normalizeModules } from "../fmxSync";

// Dependency text keyed by base schema type
const BASE_DEPS = {
  Building:                 "No dependencies",
  Resource:                 "Requires: Building",
  User:                     "Requires: Building",
  "Equipment Type":         "No dependencies",
  Equipment:                "Requires: Building + Equipment Type",
  Inventory:                "Requires: Building",
  "Work Request":           "Requires: Building (Equipment optional)",
  "Schedule Request":       "Requires: Building (Resource optional)",
  "Work Task":              "Requires: Building (Equipment optional)",
  "Transportation Request": "Requires: Building (Resource optional)",
  "Accounting Account":     "No dependencies",
};

export default function StepSelectType({ history, onSelectType, fmxModules, hasCreds }) {
  const [hovered, setHovered] = useState(null);

  const mods = normalizeModules(fmxModules);
  const importOrder = getImportOrder(mods);

  return (
    <div style={{ maxWidth: 600 }}>
      {!hasCreds && (
        <div style={{
          padding: '12px 16px', marginBottom: 12, borderRadius: 6,
          background: '#FFF8F0', border: `1px solid ${C.orange}`, color: C.navy, fontSize: 13,
        }}>
          Connect FMX credentials in project settings to see available fields and enable data push.
        </div>
      )}
      {importOrder.map((type, idx) => {
        const isHovered = hovered === type;
        const exportedRows = history.filter(h => h.type === type).reduce((a, b) => a + b.rows, 0);
        const wasExported = exportedRows > 0;
        const depText = BASE_DEPS[getBaseSchemaType(type)] || '';
        const displayName = getSchemaDisplayName(type);

        return (
          <div key={type}>
            <div
              onClick={() => hasCreds ? onSelectType(type) : null}
              onMouseEnter={() => setHovered(type)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "14px 16px", cursor: hasCreds ? "pointer" : "default",
                background: isHovered && hasCreds ? C.navyTint : C.white,
                borderLeft: isHovered && hasCreds ? `3px solid ${C.orange}` : "3px solid transparent",
                transition: "all 0.15s ease",
                opacity: hasCreds ? 1 : 0.6,
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
                <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, lineHeight: 1.3 }}>{displayName}</div>
                <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{depText}</div>
              </div>

              {/* Right: export badge + arrow */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {wasExported && (
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4,
                    background: C.okBg, color: C.okText, border: `1px solid ${C.okBorder}`,
                    whiteSpace: "nowrap",
                  }}>
                    ✓ exported
                  </span>
                )}
                {hasCreds && <span style={{ color: C.textMid, fontSize: 16 }}>→</span>}
              </div>
            </div>
            {idx < importOrder.length - 1 && (
              <div style={{ height: 1, background: C.border, marginLeft: 60 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
