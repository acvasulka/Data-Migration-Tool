import { useState, useMemo } from 'react';
import { getImportOrder, getBaseSchemaType, getSchemaModuleSlug, isModuleDisabled } from '../schemas';
import { normalizeModules } from '../fmxSync';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const GREEN = '#1A7F4E';

// Categories used to group the flat import order in the sidebar.
// Base schemas (non-module-qualified) match exact strings; module-qualified
// schemas match by base type.
const CATEGORY_RULES = [
  { key: 'core', label: 'Core Data', match: (s) => ['Building', 'Resource', 'User', 'Equipment Type', 'Equipment', 'Inventory'].includes(s) },
  { key: 'work_requests', label: 'Work Requests', match: (s) => getBaseSchemaType(s) === 'Work Request' },
  { key: 'schedule_requests', label: 'Schedule Requests', match: (s) => getBaseSchemaType(s) === 'Schedule Request' },
  { key: 'work_tasks', label: 'Work Tasks', match: (s) => getBaseSchemaType(s) === 'Work Task' },
  { key: 'other', label: 'Other', match: () => true }, // catch-all
];

function StatusDot({ done, isCurrent, disabled }) {
  if (done) return (
    <span style={{ width: 14, height: 14, borderRadius: '50%', background: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#fff', fontSize: 8, fontWeight: 700, lineHeight: 1 }}>✓</span>
    </span>
  );
  if (isCurrent) return (
    <span style={{ width: 14, height: 14, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />
  );
  return (
    <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${disabled ? '#E5E7EB' : '#D1D5DB'}`, flexShrink: 0, boxSizing: 'border-box' }} />
  );
}

export default function WorkspaceSidebar({ project, status = {}, cardSettings = {}, selectedSchema, onSelectSchema, activeWizardSchema }) {
  const mods = useMemo(() => normalizeModules(project?.fmx_modules), [project?.fmx_modules]);
  const importOrder = useMemo(() => getImportOrder(mods), [mods]);

  const [collapsed, setCollapsed] = useState({}); // { [catKey]: bool }

  // Assign each schema to exactly one category (first match wins).
  const grouped = useMemo(() => {
    const map = {};
    for (const cat of CATEGORY_RULES) map[cat.key] = [];
    for (const s of importOrder) {
      const cat = CATEGORY_RULES.find(c => c.match(s));
      if (cat) map[cat.key].push(s);
    }
    return map;
  }, [importOrder]);

  // "Current" = first non-complete schema in the import order, for visual prominence
  const currentSchema = useMemo(() => {
    for (const s of importOrder) {
      const done = status[s]?.complete || cardSettings[s]?.complete;
      if (!done) return s;
    }
    return null;
  }, [importOrder, status, cardSettings]);

  const rowLabel = (schema) => {
    const base = getBaseSchemaType(schema);
    const slug = getSchemaModuleSlug(schema);
    if (!slug) return { primary: base, secondary: null };
    // Convert slug to Title Case for display
    const pretty = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { primary: base, secondary: pretty };
  };

  const renderRow = (schema) => {
    const done = status[schema]?.complete || cardSettings[schema]?.complete;
    const disabled = isModuleDisabled(schema, mods);
    const hidden = cardSettings[schema]?.hidden;
    if (hidden) return null;

    const { primary, secondary } = rowLabel(schema);
    const isSelected = selectedSchema === schema;
    const isCurrent = currentSchema === schema;
    const isActiveWizard = activeWizardSchema === schema;

    return (
      <button
        key={schema}
        onClick={() => onSelectSchema?.(schema)}
        disabled={disabled}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '7px 12px',
          background: isSelected ? '#FFF8F6' : 'transparent',
          border: 'none',
          borderLeft: isSelected ? `3px solid ${ORANGE}` : '3px solid transparent',
          borderRadius: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
        }}
        onMouseEnter={e => { if (!isSelected && !disabled) e.currentTarget.style.background = '#F9FAFB'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <StatusDot done={done} isCurrent={!done && isCurrent} disabled={disabled} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: isSelected || isActiveWizard ? 600 : 400,
            color: done ? '#6B7280' : isSelected ? NAVY : '#374151',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {primary}
          </div>
          {secondary && (
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {secondary}
            </div>
          )}
        </div>
        {isActiveWizard && (
          <span title="Wizard session active" style={{
            fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 6,
            background: '#FFF3CD', color: '#856404', whiteSpace: 'nowrap',
          }}>wizard</span>
        )}
      </button>
    );
  };

  return (
    <div style={{
      width: 220,
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 10,
      padding: '8px 0',
      alignSelf: 'start',
      position: 'sticky',
      top: 122,
      maxHeight: 'calc(100vh - 140px)',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {CATEGORY_RULES.map(cat => {
        const items = grouped[cat.key].filter(s => !cardSettings[s]?.hidden);
        if (items.length === 0) return null;
        const isCollapsed = !!collapsed[cat.key];
        return (
          <div key={cat.key} style={{ marginBottom: 2 }}>
            <button
              onClick={() => setCollapsed(c => ({ ...c, [cat.key]: !c[cat.key] }))}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px 4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 9, color: '#9CA3AF' }}>{isCollapsed ? '▸' : '▾'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {cat.label}
              </span>
              <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{items.length}</span>
            </button>
            {!isCollapsed && items.map(renderRow)}
          </div>
        );
      })}
    </div>
  );
}
