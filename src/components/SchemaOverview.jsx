import { useState } from "react";
import { C } from "../theme";
import { IMPORT_ORDER, FMX_SCHEMAS } from "../schemas";
import { getImportRows } from "../db";
import { downloadCSV } from "../utils";

const NAVY = C.navy;
const ORANGE = C.orange;
const GREEN = '#1A7F4E';

const DEPS = {
  Building:         "No dependencies",
  Resource:         "Requires: Building",
  User:             "Requires: Building",
  "Equipment Type": "No dependencies",
  Equipment:        "Requires: Building + Equipment Type",
  Inventory:        "Requires: Building",
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActionBtn({ label, color = NAVY, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 11, color, padding: '2px 4px',
        fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}

function Dot() {
  return <span style={{ color: '#D1D5DB', fontSize: 11, userSelect: 'none' }}>·</span>;
}

export default function SchemaOverview({ imports = [], hasCreds, onSelectType, onResume, onRepush, onViewImport, history = [] }) {
  const [downloadingId, setDownloadingId] = useState(null);

  // Group imports by schema
  const bySchema = {};
  for (const imp of imports) {
    if (!bySchema[imp.schema_type]) bySchema[imp.schema_type] = [];
    bySchema[imp.schema_type].push(imp);
  }

  // Session exports by type
  const sessionByType = {};
  history.forEach(h => { sessionByType[h.type] = h; });

  const handleDownload = async (rec) => {
    setDownloadingId(rec.id);
    const rows = await getImportRows(rec.id);
    if (rows && rows.length > 0) {
      downloadCSV(`${rec.import_name || rec.schema_type}.csv`, Object.keys(rows[0]), rows);
    }
    setDownloadingId(null);
  };

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
      }}>
        {IMPORT_ORDER.map((schema, idx) => {
          const schemaImports = bySchema[schema] || [];
          const hasImports = schemaImports.length > 0;
          const fieldCount = FMX_SCHEMAS[schema]?.fields?.length || 0;
          const inSession = !!sessionByType[schema];

          return (
            <div
              key={schema}
              style={{
                background: hasImports ? '#F0FAF4' : '#fff',
                border: hasImports ? '1px solid #BBE5CB' : '1px solid #E5E7EB',
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Card header */}
              <div style={{ padding: '16px 20px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  {/* Number circle */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: hasImports ? GREEN : NAVY,
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {hasImports ? '✓' : idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>{schema}</div>
                    <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{DEPS[schema]}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: C.textLight }}>{fieldCount} fields</span>
                    {inSession && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: C.okBg, color: C.okText, border: `1px solid ${C.okBorder}`,
                      }}>✓ just now</span>
                    )}
                  </div>
                </div>

                {/* Upload button */}
                <button
                  onClick={() => onSelectType(schema)}
                  style={{
                    width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 600,
                    background: ORANGE, color: '#fff', border: 'none', borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'system-ui, -apple-system, sans-serif',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.orangeHov || '#b8410f'}
                  onMouseLeave={e => e.currentTarget.style.background = ORANGE}
                >
                  ↑ Upload new data
                </button>
              </div>

              {/* Import history (if any) */}
              {hasImports && (
                <div style={{ borderTop: '1px solid #C6E8D1', padding: '10px 20px 14px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                    {schemaImports.length} saved import{schemaImports.length !== 1 ? 's' : ''}
                  </p>
                  {schemaImports.map(rec => (
                    <div
                      key={rec.id}
                      style={{
                        padding: '7px 10px',
                        background: 'rgba(255,255,255,0.7)',
                        borderRadius: 6,
                        border: '1px solid #C6E8D1',
                        marginBottom: 6,
                      }}
                    >
                      {/* Import name + meta */}
                      <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 2 }}>
                        {rec.import_name || rec.schema_type}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMid, marginBottom: 5 }}>
                        {(rec.row_count_stored ?? rec.row_count) || 0} rows
                        {rec.truncated ? ' (capped)' : ''}
                        {' · '}{fmtDate(rec.completed_at)}
                        {rec.source_filename ? ` · ${rec.source_filename}` : ''}
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <ActionBtn label="👁 View" onClick={() => onViewImport(rec)} />
                        <Dot />
                        <ActionBtn
                          label={downloadingId === rec.id ? '…' : '↓ Download'}
                          onClick={() => handleDownload(rec)}
                        />
                        <Dot />
                        <ActionBtn label="▶ Resume" color={ORANGE} onClick={() => onResume(rec)} />
                        {hasCreds && (
                          <>
                            <Dot />
                            <ActionBtn label="⬆ Re-push" color={GREEN} onClick={() => onRepush(rec)} />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state — no imports yet */}
              {!hasImports && (
                <div style={{ padding: '0 20px 16px' }}>
                  <p style={{ fontSize: 11, color: C.textLight, margin: 0, fontStyle: 'italic' }}>
                    No imports yet — upload a CSV or Excel file to get started.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
