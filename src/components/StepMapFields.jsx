import { C } from "../theme";

export default function StepMapFields({
  csv,
  schemaType,
  allFields,
  groupedFields,
  mapping,
  setMapping,
  transformRules,
  setTransformRules,
  customFields,
  setCustomFields,
  dynamicRates,
  setDynamicRates,
  goToValidate,
  setPreview,
  setTransformModal,
}) {
  const getColPreview = col =>
    !csv || !col ? [] : [...new Set(csv.rows.map(r => r[col]).filter(v => v !== undefined))].slice(0, 20);

  return (
    <div>
      <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
        <strong style={{ color: C.navy }}>{csv.rows.length} rows</strong> · <strong style={{ color: C.navy }}>{csv.headers.length} columns</strong> detected. Map CSV columns to FMX fields. <span style={{ color: C.orange }}>*</span> = required.
      </p>

      {(schemaType === "Building" || schemaType === "Resource") && (
        <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: C.white, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Custom fields</p>
          {customFields.map((cf, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                className="fmx-input"
                value={cf}
                onChange={e => setCustomFields(fs => fs.map((f, j) => j === i ? e.target.value : f))}
                placeholder="Custom field name"
                style={{ flex: 1 }}
              />
              <button className="fmx-btn-destructive" onClick={() => setCustomFields(fs => fs.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setCustomFields(fs => [...fs, ""])}>
            + Add custom field
          </button>
        </div>
      )}

      {schemaType === "Resource" && (
        <div style={{ marginBottom: "1.5rem", padding: "14px 16px", background: C.white, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Scheduling rate buckets</p>
          {dynamicRates.map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.textDark, minWidth: 60 }}>Rate {i + 1}</span>
              <span style={{ fontSize: 12, color: C.textMid }}>Cost + Unit</span>
              <button className="fmx-btn-destructive" onClick={() => setDynamicRates(r => r.filter((_, j) => j !== i))} style={{ marginLeft: "auto" }}>Remove</button>
            </div>
          ))}
          <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setDynamicRates(r => [...r, ""])}>
            + Add rate bucket
          </button>
        </div>
      )}

      {Object.entries(groupedFields).map(([group, fields]) => (
        <div key={group} style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group}</p>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {fields.map((f, i) => {
              const hasRule = !!transformRules[f.name];
              const mappedCol = mapping[f.name];
              return (
                <div
                  key={f.name}
                  style={{
                    display: "grid", gridTemplateColumns: "180px 16px 1fr auto auto",
                    alignItems: "center", gap: 8, padding: "7px 12px",
                    borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : "none",
                    background: hasRule ? C.navyTint : i % 2 === 0 ? C.white : C.bgPage,
                  }}
                >
                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textDark }}>
                    {f.name}{f.required && <span style={{ color: C.orange }}> *</span>}
                    {f.crossSheet && <span style={{ fontSize: 10, color: C.blue, marginLeft: 5 }}>→{f.crossSheet}</span>}
                  </div>
                  <div style={{ textAlign: "center", color: C.textLight, fontSize: 12 }}>→</div>
                  {hasRule
                    ? <span style={{ fontSize: 12, color: C.blue, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Rule: {transformRules[f.name].instruction}
                      </span>
                    : <select
                        className="fmx-select"
                        value={mappedCol ?? ""}
                        onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value || undefined }))}
                      >
                        <option value="">— skip —</option>
                        {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                  }
                  {mappedCol && !hasRule && (
                    <button
                      className="fmx-btn-xs"
                      onClick={() => setPreview({ header: mappedCol, values: getColPreview(mappedCol) })}
                    >
                      View data
                    </button>
                  )}
                  <button
                    className={`fmx-btn-xs-rule${hasRule ? " active" : ""}`}
                    onClick={() => hasRule
                      ? setTransformRules(r => { const n = { ...r }; delete n[f.name]; return n; })
                      : setTransformModal(f.name)
                    }
                  >
                    {hasRule ? "Clear rule" : "Add rule"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button className="fmx-btn-primary" onClick={goToValidate}>Validate →</button>
    </div>
  );
}
