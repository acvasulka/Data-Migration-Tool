import { useState } from "react";
import { C } from "../theme";
import { FMX_SCHEMAS, getImportOrder, getBaseSchemaType, getSchemaDisplayName, isModuleDisabled } from "../schemas";
import { normalizeModules } from "../fmxSync";
import { getImportRows, updateCardSetting } from "../db";
import { downloadCSV } from "../utils";

const NAVY = C.navy;
const ORANGE = C.orange;
const GREEN = '#1A7F4E';

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

function getDeps(schemaType) {
  return BASE_DEPS[getBaseSchemaType(schemaType)] || '';
}

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

export default function SchemaOverview({
  imports = [], hasCreds, onSelectType, onResume, onRepush, onViewImport,
  history = [], fmxModules, cardSettings = {}, projectId, onProjectUpdated,
}) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [showHidden, setShowHidden] = useState(false);

  // Normalise and build the dynamic import order for this project
  const mods = normalizeModules(fmxModules);
  const importOrder = getImportOrder(mods);

  // Group imports by schema
  const bySchema = {};
  for (const imp of imports) {
    if (!bySchema[imp.schema_type]) bySchema[imp.schema_type] = [];
    bySchema[imp.schema_type].push(imp);
  }

  // Session exports by type
  const sessionByType = {};
  history.forEach(h => { sessionByType[h.type] = h; });

  // Sort cards into buckets
  const activeCards = [];
  const completedCards = [];
  const hiddenCards = [];
  for (const schema of importOrder) {
    const s = cardSettings[schema] || {};
    if (s.hidden) hiddenCards.push(schema);
    else if (s.complete) completedCards.push(schema);
    else activeCards.push(schema);
  }
  const visibleCards = [...activeCards, ...completedCards];

  const handleDownload = async (rec) => {
    setDownloadingId(rec.id);
    const rows = await getImportRows(rec.id);
    if (rows && rows.length > 0) {
      downloadCSV(`${rec.import_name || rec.schema_type}.csv`, Object.keys(rows[0]), rows);
    }
    setDownloadingId(null);
  };

  const toggleExpand = (schema) => {
    setExpandedCards(prev => ({ ...prev, [schema]: !prev[schema] }));
  };

  const handleToggleComplete = async (schema) => {
    const current = cardSettings[schema]?.complete || false;
    const updated = await updateCardSetting(projectId, schema, 'complete', !current);
    if (updated && onProjectUpdated) onProjectUpdated(updated);
  };

  const handleUnhide = async (schema) => {
    const updated = await updateCardSetting(projectId, schema, 'hidden', false);
    if (updated && onProjectUpdated) onProjectUpdated(updated);
  };

  const renderCard = (schema, idx, { isHidden = false } = {}) => {
    const schemaImports = bySchema[schema] || [];
    const hasImports = schemaImports.length > 0;
    const fieldCount = FMX_SCHEMAS[getBaseSchemaType(schema)]?.fields?.length || 0;
    const inSession = !!sessionByType[schema];
    const disabled = isModuleDisabled(schema, mods);
    const isComplete = cardSettings[schema]?.complete || false;
    const isExpanded = expandedCards[schema] || false;

    // Determine card visual state
    const isGrayed = disabled || isComplete;
    const cardBg = isGrayed ? '#F9FAFB' : hasImports ? '#F0FAF4' : '#fff';
    const cardBorder = isGrayed ? '1px solid #E5E7EB' : hasImports ? '1px solid #BBE5CB' : '1px solid #E5E7EB';
    const circleColor = isGrayed ? '#9CA3AF' : hasImports ? GREEN : NAVY;
    const titleColor = isGrayed ? '#9CA3AF' : NAVY;

    return (
      <div
        key={schema}
        style={{
          background: cardBg,
          border: cardBorder,
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          opacity: isHidden ? 0.5 : disabled ? 0.75 : 1,
        }}
      >
        {/* Card header */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            {/* Number circle */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: circleColor,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {hasImports || isComplete ? '✓' : idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: titleColor, lineHeight: 1.3 }}>
                  {getSchemaDisplayName(schema)}
                </span>
                {/* Import count badge */}
                {hasImports && (
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10,
                    background: GREEN, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    {schemaImports.length} import{schemaImports.length !== 1 ? 's' : ''}
                  </span>
                )}
                {/* Complete badge */}
                {isComplete && !disabled && (
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10,
                    background: '#E5E7EB', color: '#6B7280', fontWeight: 600,
                  }}>Complete</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{getDeps(schema)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {disabled ? (
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                  fontWeight: 600,
                }}>Module disabled</span>
              ) : (
                <span style={{ fontSize: 11, color: C.textLight }}>{fieldCount} fields</span>
              )}
              {inSession && !disabled && (
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: C.okBg, color: C.okText, border: `1px solid ${C.okBorder}`,
                }}>✓ just now</span>
              )}
              {/* Expand/collapse chevron */}
              {hasImports && (
                <button
                  onClick={() => toggleExpand(schema)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: '#9CA3AF', padding: '0 2px',
                    fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1,
                  }}
                  title={isExpanded ? 'Collapse imports' : 'Expand imports'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
            </div>
          </div>

          {/* Upload button — hidden for disabled modules, dimmed for completed */}
          {!disabled && !isHidden && (
            <button
              onClick={() => onSelectType(schema)}
              style={{
                width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 600,
                background: ORANGE, color: '#fff', border: 'none', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'system-ui, -apple-system, sans-serif',
                transition: 'background 0.15s',
                opacity: isComplete ? 0.6 : 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.orangeHov || '#b8410f'}
              onMouseLeave={e => e.currentTarget.style.background = ORANGE}
            >
              ↑ Upload new data
            </button>
          )}
          {disabled && (
            <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>
              This module is no longer active in your FMX organization.
            </div>
          )}

          {/* Mark complete / Undo — for non-disabled, non-hidden cards */}
          {!disabled && !isHidden && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                onClick={() => handleToggleComplete(schema)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: '#9CA3AF', padding: '2px 4px',
                  fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500,
                }}
              >
                {isComplete ? 'Undo complete' : 'Mark complete'}
              </button>
            </div>
          )}

          {/* Show button — for hidden cards only */}
          {isHidden && (
            <button
              onClick={() => handleUnhide(schema)}
              style={{
                width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 500,
                background: '#fff', color: NAVY, border: '1px solid #D1D5DB', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'system-ui, -apple-system, sans-serif',
                marginTop: 4,
              }}
            >
              Show card
            </button>
          )}
        </div>

        {/* Import history (expandable) */}
        {hasImports && isExpanded && (
          <div style={{ borderTop: isGrayed ? '1px solid #E5E7EB' : '1px solid #C6E8D1', padding: '10px 20px 14px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: isGrayed ? '#9CA3AF' : GREEN, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              {schemaImports.length} saved import{schemaImports.length !== 1 ? 's' : ''}
            </p>
            {schemaImports.map(rec => (
              <div
                key={rec.id}
                style={{
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.7)',
                  borderRadius: 6,
                  border: isGrayed ? '1px solid #E5E7EB' : '1px solid #C6E8D1',
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

        {/* Empty state — no imports yet (only for active non-hidden cards) */}
        {!hasImports && !isHidden && (
          <div style={{ padding: '0 20px 16px' }}>
            <p style={{ fontSize: 11, color: C.textLight, margin: 0, fontStyle: 'italic' }}>
              No imports yet — upload a CSV or Excel file to get started.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Main card grid: active + completed */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
      }}>
        {visibleCards.map((schema, idx) => renderCard(schema, idx))}
      </div>

      {/* Hidden cards section */}
      {hiddenCards.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowHidden(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: C.textMid, padding: '8px 0',
              fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500,
            }}
          >
            {showHidden ? '▾' : '▸'} {hiddenCards.length} hidden card{hiddenCards.length !== 1 ? 's' : ''}
          </button>
          {showHidden && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 8,
            }}>
              {hiddenCards.map((schema, idx) => renderCard(schema, visibleCards.length + idx, { isHidden: true }))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
