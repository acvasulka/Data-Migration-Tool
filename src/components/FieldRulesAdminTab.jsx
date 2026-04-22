import { useState, useMemo } from 'react';
import { FMX_FIELD_ENRICHMENTS } from '../fmxFieldMetadata';
import { upsertFieldOverride, deleteFieldOverride } from '../db';

const NAVY = '#041662';
const GREEN = '#1A7F4E';
const ORANGE = '#CF4A12';

/**
 * FieldRulesAdminTab — inspect & override the "is required" flag for every
 * field across every schema.
 *
 * Resolution shown in the "Effective" column mirrors buildFieldDefinitions:
 *   admin override  >  enrichment default  >  false
 *
 * (The API /post-options column is per-project — not global — so it's
 * deliberately omitted from v1. Admins see any divergence when importing.)
 */
export default function FieldRulesAdminTab({ fieldOverrides, onFieldOverridesChanged, currentUserId }) {
  const entities = useMemo(() => Object.keys(FMX_FIELD_ENRICHMENTS).sort(), []);
  const [selectedEntity, setSelectedEntity] = useState(entities[0] || null);
  const [busyKey, setBusyKey] = useState(null); // `${schema}:${field}` currently saving
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    if (!selectedEntity) return [];
    const enrich = FMX_FIELD_ENRICHMENTS[selectedEntity] || {};
    const overridesForEntity = fieldOverrides?.[selectedEntity] || {};
    const list = Object.entries(enrich).map(([fieldKey, meta]) => {
      const ov = overridesForEntity[fieldKey];
      // null means "row exists but no requiredness opinion"; undefined means
      // "no override row at all". Both fall through to the enrichment default.
      const overrideVal = ov && ov.is_required != null ? ov.is_required : null;
      const enrichmentVal = meta.isRequired === true;
      const effective = overrideVal != null ? overrideVal : enrichmentVal;
      return {
        fieldKey,
        label: meta.label || fieldKey,
        enrichmentVal,
        overrideVal,       // true | false | null (null = defer)
        effective,
        divergent: overrideVal != null && overrideVal !== enrichmentVal,
        notes: ov?.notes || '',
        updatedAt: ov?.updated_at,
      };
    });
    const q = search.trim().toLowerCase();
    return q
      ? list.filter(r => r.fieldKey.toLowerCase().includes(q) || r.label.toLowerCase().includes(q))
      : list;
  }, [selectedEntity, fieldOverrides, search]);

  const handleOverrideChange = async (fieldKey, newVal) => {
    // newVal: 'defer' | 'true' | 'false'
    setErrorMsg('');
    const key = `${selectedEntity}:${fieldKey}`;
    setBusyKey(key);
    let ok;
    if (newVal === 'defer') {
      // Remove the row entirely so defaults re-apply cleanly.
      ok = await deleteFieldOverride(selectedEntity, fieldKey);
    } else {
      ok = await upsertFieldOverride(
        selectedEntity,
        fieldKey,
        { is_required: newVal === 'true', notes: null },
        currentUserId,
      );
    }
    if (!ok) setErrorMsg('Could not save override — your session may have lost admin rights.');
    else await onFieldOverridesChanged?.();
    setBusyKey(null);
  };

  if (!selectedEntity) {
    return <div style={{ padding: 24 }}><p style={{ color: '#9CA3AF', fontSize: 13 }}>No enriched entities registered.</p></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Top bar: entity picker + search */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 12, background: '#F9FAFB' }}>
        <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>Entity</label>
        <select
          value={selectedEntity}
          onChange={e => setSelectedEntity(e.target.value)}
          style={{ fontSize: 13, padding: '5px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', minWidth: 200 }}
        >
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search fields…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 5, border: '1px solid #D1D5DB' }}
        />
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          {rows.length} field{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {errorMsg && (
        <div style={{ padding: '8px 28px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#DC2626', fontSize: 12 }}>
          {errorMsg}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: '10px 28px', fontSize: 11, color: '#6B7280', background: '#FEFCE8', borderBottom: '1px solid #FDE68A', lineHeight: 1.5 }}>
        <strong>Precedence:</strong> admin override &gt; API /post-options (at import time) &gt; enrichment default.
        Set <em>Defer</em> to remove your override and fall back to the default. Enrichment defaults are code-owned and ship with each release.
      </div>

      {/* Table */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={th}>Field</th>
              <th style={{ ...th, textAlign: 'center' }}>API key</th>
              <th style={{ ...th, textAlign: 'center' }}>Default</th>
              <th style={{ ...th, textAlign: 'center' }}>Override</th>
              <th style={{ ...th, textAlign: 'center' }}>Effective</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const key = `${selectedEntity}:${r.fieldKey}`;
              const busy = busyKey === key;
              const ovDisplay = r.overrideVal == null ? 'defer' : r.overrideVal ? 'true' : 'false';
              return (
                <tr key={r.fieldKey} style={{ borderBottom: '1px solid #F3F4F6', background: r.divergent ? '#FFF8F0' : undefined }}>
                  <td style={td}>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{r.label}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>
                    {r.fieldKey}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <Pill value={r.enrichmentVal} muted />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <select
                      value={ovDisplay}
                      disabled={busy}
                      onChange={e => handleOverrideChange(r.fieldKey, e.target.value)}
                      style={{
                        fontSize: 12, padding: '3px 6px', borderRadius: 4,
                        border: '1px solid #D1D5DB', background: '#fff',
                        cursor: busy ? 'wait' : 'pointer',
                        color: ovDisplay === 'defer' ? '#9CA3AF' : '#111827',
                        fontStyle: ovDisplay === 'defer' ? 'italic' : 'normal',
                      }}
                    >
                      <option value="defer">Defer (use default)</option>
                      <option value="true">Required</option>
                      <option value="false">Optional</option>
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <Pill value={r.effective} />
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontSize: 11 }}>
                    {r.divergent
                      ? <span style={{ color: ORANGE, fontWeight: 600 }}>⚠ overridden</span>
                      : r.overrideVal != null
                        ? <span style={{ color: GREEN }}>✓ confirmed</span>
                        : <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>default</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', padding: 20 }}>
                  No fields match "{search}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Required/optional chip — `muted` drops the saturation for default columns.
function Pill({ value, muted }) {
  if (value) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        background: muted ? '#F3F4F6' : '#FEE2E2',
        color: muted ? '#6B7280' : '#991B1B',
        border: muted ? '1px solid #E5E7EB' : '1px solid #FECACA',
      }}>required</span>
    );
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
      background: muted ? '#F9FAFB' : '#ECFDF5',
      color: muted ? '#9CA3AF' : '#047857',
      border: muted ? '1px solid #F3F4F6' : '1px solid #A7F3D0',
    }}>optional</span>
  );
}

const th = {
  padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: '1px solid #E5E7EB', fontSize: 12, whiteSpace: 'nowrap',
};
const td = { padding: '8px 16px', verticalAlign: 'middle' };
