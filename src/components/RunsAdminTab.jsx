import { useState, useEffect, useMemo } from 'react';
import { getAllExtractionRuns } from '../db';

const NAVY = '#041662';
const BORDER = '#E5E7EB';

// Read-only audit log of PDF extraction runs. Shows which prompt version was
// used, whether it succeeded, how long it took, and basic scale (pages).
export default function RunsAdminTab({ allProfiles }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getAllExtractionRuns({ limit: 200 });
      setRuns(data);
      setLoading(false);
    })();
  }, []);

  const userMap = useMemo(() => {
    const m = {};
    for (const p of allProfiles || []) m[p.id] = p.full_name || p.email;
    return m;
  }, [allProfiles]);

  const filtered = useMemo(() => {
    return runs.filter(r =>
      (!filterType || r.migration_type === filterType) &&
      (!filterStatus || r.status === filterStatus)
    );
  }, [runs, filterType, filterStatus]);

  const allTypes = useMemo(() => Array.from(new Set(runs.map(r => r.migration_type))).sort(), [runs]);

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
        Every PDF extraction records which prompt version was used, the page count,
        timing, and outcome — full audit trail for debugging and accountability.
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#374151' }}>Type:</label>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB` }}
        >
          <option value="">All</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#374151' }}>Status:</label>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB` }}
        >
          <option value="">All</option>
          <option value="complete">Complete</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${filtered.length} of ${runs.length} runs`}
        </span>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', flex: 1, minHeight: 0 }}>
        {filtered.length === 0 && !loading ? (
          <div style={{ padding: 24, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }}>
            No extraction runs yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                <th style={th}>When</th>
                <th style={th}>Type</th>
                <th style={th}>File</th>
                <th style={{ ...th, textAlign: 'right' }}>Pages</th>
                <th style={{ ...th, textAlign: 'right' }}>Prompt v</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Time</th>
                <th style={th}>User</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid #F3F4F6` }}>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: '#6B7280' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </td>
                  <td style={td}><strong>{r.migration_type}</strong></td>
                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.source_filename}>
                    {r.source_filename || '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.page_count ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#6B7280' }}>v{r.prompt_version ?? '—'}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 8,
                      background: statusBg(r.status), color: statusFg(r.status),
                    }}>
                      {r.status.toUpperCase()}
                    </span>
                    {r.error && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#B91C1C' }} title={r.error}>
                        {r.error.slice(0, 40)}{r.error.length > 40 ? '…' : ''}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#6B7280' }}>
                    {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td style={{ ...td, color: '#6B7280' }}>{userMap[r.user_id] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function statusBg(s) {
  if (s === 'complete') return '#DCFCE7';
  if (s === 'error') return '#FEE2E2';
  if (s === 'running') return '#DBEAFE';
  return '#F3F4F6';
}
function statusFg(s) {
  if (s === 'complete') return '#166534';
  if (s === 'error') return '#991B1B';
  if (s === 'running') return '#1E40AF';
  return '#6B7280';
}

const th = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: `1px solid ${BORDER}`, fontSize: 11, whiteSpace: 'nowrap',
};
const td = { padding: '8px 12px', verticalAlign: 'middle' };
