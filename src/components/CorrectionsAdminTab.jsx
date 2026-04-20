import { useState, useEffect, useMemo } from 'react';
import {
  getCorrections,
  getAllPrompts,
  promoteCorrectionToExample,
  markCorrectionsReviewed,
} from '../db';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const BORDER = '#E5E7EB';

// Shows unreviewed user corrections to PDF-extracted data, grouped by the
// (migration_type, original → corrected) pattern so admins can spot recurring
// Claude mistakes and promote one-click fixes into few-shot examples.
export default function CorrectionsAdminTab({ currentUserId }) {
  const [corrections, setCorrections] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      getCorrections({ reviewed: false, limit: 500 }),
      getAllPrompts(),
    ]);
    setCorrections(c);
    setPrompts(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group corrections into patterns: same migration_type + type + original → corrected.
  const patterns = useMemo(() => {
    const map = new Map();
    for (const c of corrections) {
      if (filterType && c.migration_type !== filterType) continue;
      const key = [
        c.migration_type, c.correction_type,
        (c.original_value || '').trim().toLowerCase(),
        (c.corrected_value || '').trim().toLowerCase(),
        c.correction_type === 'cell_edit' ? (c.field_path || '') : '',
      ].join('|');
      if (!map.has(key)) {
        map.set(key, {
          key,
          migration_type: c.migration_type,
          correction_type: c.correction_type,
          field_path: c.field_path,
          original_value: c.original_value,
          corrected_value: c.corrected_value,
          count: 0,
          ids: [],
          latest: c.created_at,
        });
      }
      const pat = map.get(key);
      pat.count++;
      pat.ids.push(c.id);
      if (c.created_at > pat.latest) pat.latest = c.created_at;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [corrections, filterType]);

  const allTypes = useMemo(() => {
    return Array.from(new Set(corrections.map(c => c.migration_type))).sort();
  }, [corrections]);

  const handlePromote = async (pattern) => {
    // Find the active prompt for this migration_type / stage=extraction.
    const activePrompt = prompts.find(
      p => p.migration_type === pattern.migration_type && p.stage === 'extraction' && p.active
    );
    if (!activePrompt) {
      alert(
        `No active prompt for "${pattern.migration_type}". Create one on the PDF Prompts tab first.`
      );
      return;
    }
    setBusy(true);
    const hint = pattern.correction_type === 'header_rename'
      ? `When you see the label "${pattern.original_value}", it should map to "${pattern.corrected_value}".`
      : `For the "${pattern.field_path}" column, values like "${pattern.original_value}" should be normalized to "${pattern.corrected_value}".`;
    const label = pattern.correction_type === 'header_rename'
      ? `${pattern.original_value} → ${pattern.corrected_value}`
      : `${pattern.field_path}: ${pattern.original_value} → ${pattern.corrected_value}`;
    // Promote the first correction in the pattern (the rest get auto-reviewed below).
    const result = await promoteCorrectionToExample({
      correctionId: pattern.ids[0],
      promptId: activePrompt.id,
      exampleJson: {
        hint,
        pattern_type: pattern.correction_type,
        original: pattern.original_value,
        corrected: pattern.corrected_value,
        field: pattern.field_path,
      },
      label,
      createdBy: currentUserId,
    });
    if (result && pattern.ids.length > 1) {
      // Mark sibling corrections reviewed so they don't re-surface.
      await markCorrectionsReviewed(pattern.ids.slice(1));
    }
    await load();
    setBusy(false);
  };

  const handleDismiss = async (pattern) => {
    setBusy(true);
    await markCorrectionsReviewed(pattern.ids);
    await load();
    setBusy(false);
  };

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
        Unreviewed user edits to PDF-extracted data, grouped by pattern. Promote repeated
        patterns into few-shot examples so Claude applies the fix on future extractions.
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#374151' }}>Filter type:</label>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB` }}
        >
          <option value="">All</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${patterns.length} pattern${patterns.length === 1 ? '' : 's'}, ${corrections.length} total`}
        </span>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', flex: 1, minHeight: 0 }}>
        {patterns.length === 0 && !loading ? (
          <div style={{ padding: 24, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }}>
            No unreviewed corrections. Users haven't edited PDF-extracted data recently.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                <th style={th}>Type</th>
                <th style={th}>Kind</th>
                <th style={th}>Field</th>
                <th style={th}>Original</th>
                <th style={th}>Corrected</th>
                <th style={{ ...th, textAlign: 'center' }}>Count</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map(pat => (
                <tr key={pat.key} style={{ borderBottom: `1px solid #F3F4F6` }}>
                  <td style={td}><strong>{pat.migration_type}</strong></td>
                  <td style={td}>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: pat.correction_type === 'header_rename' ? '#EEF0F8' : '#FEF3C7', color: pat.correction_type === 'header_rename' ? NAVY : '#92400E' }}>
                      {pat.correction_type === 'header_rename' ? 'HEADER' : 'CELL'}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#6B7280' }}>{pat.correction_type === 'cell_edit' ? pat.field_path : '—'}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', color: '#B91C1C', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pat.original_value}>
                    {pat.original_value || '∅'}
                  </td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', color: '#166534', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pat.corrected_value}>
                    {pat.corrected_value || '∅'}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{pat.count}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      onClick={() => handlePromote(pat)}
                      disabled={busy}
                      style={{ fontSize: 11, padding: '4px 10px', marginRight: 4, borderRadius: 4, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer' }}
                    >Promote</button>
                    <button
                      onClick={() => handleDismiss(pat)}
                      disabled={busy}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
                    >Dismiss</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const th = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: `1px solid ${BORDER}`, fontSize: 11, whiteSpace: 'nowrap',
};
const td = { padding: '8px 12px', verticalAlign: 'middle' };
