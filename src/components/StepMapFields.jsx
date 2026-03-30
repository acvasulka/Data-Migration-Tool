import { useState } from "react";
import { C } from "../theme";
import { getFieldTypeLabel, FMX_FIELD_TYPE_MAP } from "../fmxFieldTypes";

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
  fileInfo,
  setPreview,
  openTransformModal,
  memoryMatches,
  mappingSources,
  savedRules,
  fmxSyncData,
  onCustomFieldTypeChange,
}) {
  const [hideEmptyUnmapped, setHideEmptyUnmapped] = useState(false);
  const getColPreview = col =>
    !csv || !col ? [] : [...new Set(csv.rows.map(r => r[col]).filter(v => v !== undefined))].slice(0, 20);

  // FMX API supports custom fields on all entity types via post-options
  const supportsCustomFields = true;

  const mappedCols = new Set(Object.values(mapping).filter(Boolean));
  const unmappedHeaders = csv.headers.filter(h => !mappedCols.has(h));
  const getSampleValue = col => {
    for (const row of csv.rows.slice(0, 5)) {
      if (row[col] && row[col].trim()) return row[col];
    }
    return null;
  };

  const TYPE_LABEL_STYLE = {
    fontSize: 10, color: '#9CA3AF', background: '#F9FAFB',
    border: '0.5px solid #E5E7EB', borderRadius: 3,
    padding: '1px 5px', marginLeft: 6, fontWeight: 400,
  };

  const getTypeLabel = (f) => {
    if (f.isCustomField) {
      return getFieldTypeLabel(f.fieldType);
    }
    const standardTypeLabel = { string: 'Text', number: 'Number', date: 'Date', email: 'Email' };
    return standardTypeLabel[f.type] || null;
  };

  const getBadge = (f, sourceHeader) => {
    if (f.isCustomField) {
      return { label: 'FMX custom', bg: '#F3E8FF', color: '#6B21A8', border: '#D8B4FE' };
    }
    if (!sourceHeader) return null;
    const source = mappingSources?.[f.name];
    if (source === 'memory') {
      const conf = memoryMatches?.[sourceHeader]?.confidence ?? 2;
      return { label: `Remembered ×${conf}`, bg: '#E1F5EE', color: '#0F6E56', border: '#5DCAA5' };
    }
    if (source === 'ai') {
      return { label: 'AI suggested', bg: '#E6F1FB', color: '#185FA5', border: '#85B7EB' };
    }
    if (source === 'auto') {
      return { label: 'Auto-matched', bg: '#F1EFE8', color: '#5F5E5A', border: '#B4B2A9' };
    }
    return null;
  };

  const ROW_STYLE = (hasRule, i) => ({
    display: "grid", gridTemplateColumns: "170px 14px 1fr auto auto auto",
    alignItems: "center", gap: 8, padding: "5px 10px",
    borderBottom: `1px solid ${C.border}`,
    background: hasRule ? C.navyTint : i % 2 === 0 ? C.white : C.bgPage,
  });

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ fontSize: 13, color: C.textMid, marginBottom: "1rem" }}>
        <strong style={{ color: C.navy }}>{csv.rows.length} rows</strong>
        {" · "}
        <strong style={{ color: C.navy }}>{csv.headers.length} columns</strong>
        {fileInfo && fileInfo.type !== "CSV" && (
          <> · {fileInfo.type}{fileInfo.sheetName ? ` · Sheet: '${fileInfo.sheetName}'` : ""}</>
        )}
        {" · "}Map CSV columns to FMX fields. <span style={{ color: C.orange }}>*</span> = required.
      </p>

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

      {Object.entries(groupedFields)
        .filter(([group]) => group !== "Custom Fields")
        .map(([group, fields]) => (
          <div key={group} style={{ marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group}</p>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {fields.map((f, i) => {
                const hasRule = !!transformRules[f.name];
                const mappedCol = mapping[f.name];
                const badge = getBadge(f, mappedCol);
                const hasSavedRule = !!savedRules?.[f.name] && !hasRule;
                return (
                  <div key={f.name} style={ROW_STYLE(hasRule, i)}>
                    <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textDark }}>
                      {f.name}{f.required && <span style={{ color: C.orange }}> *</span>}
                      {f.crossSheet && <span style={{ fontSize: 10, color: C.blue, marginLeft: 5 }}>→{f.crossSheet}</span>}
                      {f.isCustomField
                        ? <select
                            style={{ fontSize: 10, padding: '1px 4px', border: `1px solid ${C.border}`, borderRadius: 3, background: '#F9FAFB', color: '#6B7280', marginLeft: 6, cursor: 'pointer' }}
                            value={f.fieldType || 'Text'}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onCustomFieldTypeChange?.(f.customFieldId, e.target.value)}
                          >
                            {Object.entries(FMX_FIELD_TYPE_MAP).map(([key, { label }]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        : getTypeLabel(f) && <span style={TYPE_LABEL_STYLE}>{getTypeLabel(f)}</span>
                      }
                    </div>
                    <div style={{ textAlign: "center", color: C.textLight, fontSize: 12 }}>→</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      {hasRule
                        ? <span style={{ fontSize: 13, color: C.blue, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            Rule: {transformRules[f.name].instruction}
                          </span>
                        : <select className="fmx-select" style={{ fontSize: 13 }} value={mappedCol ?? ""} onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value || undefined }))}>
                            <option value="">— skip —</option>
                            {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                      }
                      {hasSavedRule && (
                        <button
                          onClick={() => openTransformModal(f.name, savedRules[f.name])}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 11, color: '#0F6E56', padding: '0',
                            textDecoration: 'underline', textAlign: 'left',
                            fontFamily: 'inherit', lineHeight: 1.4,
                          }}
                        >
                          Saved rule — apply?
                        </button>
                      )}
                    </div>
                    {badge ? (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: badge.bg, color: badge.color,
                        border: `1px solid ${badge.border}`,
                        whiteSpace: 'nowrap', fontWeight: 500,
                      }}>
                        {badge.label}
                      </span>
                    ) : <span />}
                    {mappedCol && !hasRule && (
                      <button className="fmx-btn-xs" style={{ fontSize: 11, padding: "2px 7px" }} onClick={() => setPreview({ header: mappedCol, values: getColPreview(mappedCol) })}>
                        View data
                      </button>
                    )}
                    {!mappedCol && !hasRule && <span />}
                    <button
                      className={`fmx-btn-xs-rule${hasRule ? " active" : ""}`}
                      style={{ fontSize: 11, padding: "2px 7px" }}
                      onClick={() => hasRule
                        ? setTransformRules(r => { const n = { ...r }; delete n[f.name]; return n; })
                        : openTransformModal(f.name)
                      }
                    >
                      {hasRule ? "Clear rule" : "Add rule"}
                    </button>
                  </div>
                );
              })}

              {/* Custom fields at the bottom of Core Fields */}
              {group === "Core Fields" && supportsCustomFields && (
                <>
                  {customFields.map((cf, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "170px 14px 1fr auto auto auto",
                      alignItems: "center", gap: 8, padding: "5px 10px",
                      borderBottom: `1px solid ${C.border}`,
                      background: C.navyTint,
                    }}>
                      <input
                        className="fmx-input"
                        value={cf.name}
                        onChange={e => {
                          const oldName = cf.name;
                          const newName = e.target.value;
                          setMapping(m => { const n = { ...m }; if (oldName) delete n[oldName]; return n; });
                          setCustomFields(fs => fs.map((f, j) => j === i ? { ...f, name: newName } : f));
                        }}
                        placeholder="Custom field name"
                        style={{ fontSize: 13, padding: "3px 8px" }}
                      />
                      <div style={{ textAlign: "center", color: C.textLight, fontSize: 12 }}>→</div>
                      <select
                        className="fmx-select"
                        style={{ fontSize: 13 }}
                        value={mapping[cf.name] ?? ""}
                        onChange={e => setMapping(m => ({ ...m, [cf.name]: e.target.value || undefined }))}
                      >
                        <option value="">— skip —</option>
                        {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span />
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.textMid, whiteSpace: "nowrap", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={cf.required || false}
                          onChange={e => setCustomFields(fs => fs.map((f, j) => j === i ? { ...f, required: e.target.checked } : f))}
                        />
                        Req.
                      </label>
                      <button
                        onClick={() => {
                          setMapping(m => { const n = { ...m }; delete n[cf.name]; return n; });
                          setCustomFields(fs => fs.filter((_, j) => j !== i));
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div style={{ padding: "6px 10px", background: C.bgPage, borderTop: customFields.length > 0 ? "none" : undefined }}>
                    <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setCustomFields(fs => [...fs, { name: "", required: false }])}>
                      + Add custom field
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

      {/* Unmapped source columns */}
      {unmappedHeaders.length > 0 && (() => {
        const emptyCount = unmappedHeaders.filter(h => !getSampleValue(h)).length;
        const displayed = hideEmptyUnmapped ? unmappedHeaders.filter(h => getSampleValue(h) !== null) : unmappedHeaders;
        return (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
              <p style={{ fontSize: 11, fontStyle: "italic", color: C.textMid, margin: 0 }}>Unmapped source columns</p>
              {emptyCount > 0 && (
                <label style={{ fontSize: 11, color: C.textLight, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={hideEmptyUnmapped} onChange={e => setHideEmptyUnmapped(e.target.checked)} style={{ cursor: "pointer" }} />
                  Hide empty ({emptyCount})
                </label>
              )}
            </div>
            <div style={{ background: C.bgPage, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {displayed.map((h, i) => {
                const sample = getSampleValue(h);
                return (
                  <div key={h} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "5px 12px", fontSize: 12, color: C.textMid,
                    borderBottom: i < displayed.length - 1 ? `1px solid ${C.border}` : "none",
                    background: i % 2 === 0 ? C.bgPage : C.white,
                  }}>
                    <span style={{ color: C.textDark, fontWeight: 500 }}>{h}</span>
                    <span style={{ color: C.textLight, fontStyle: "italic" }}>
                      {sample ? `e.g. "${sample}"` : "(no data)"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
