import { useState, useEffect, useCallback } from "react";
import { getAllDependencyCaches } from "../db";
import { fetchAllDependencies, DEPENDENCY_TYPES } from "../fmxSync";

const NAVY = '#041662';
const GREEN = '#1A7F4E';
const ORANGE = '#CF4A12';

function timeAgo(isoString) {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DependenciesView({ projectId, project, refreshKey }) {
  const [depCaches, setDepCaches] = useState({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({}); // { [depKey]: { status, count } }
  const [syncError, setSyncError] = useState(null);

  const loadCaches = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const rows = await getAllDependencyCaches(projectId);
    const map = {};
    for (const row of rows) {
      map[row.schema_type] = { items: row.extra?.items || [], totalCount: row.extra?.totalCount || 0, cachedAt: row.cached_at };
    }
    setDepCaches(map);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadCaches(); }, [loadCaches, refreshKey]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncProgress({});
    try {
      await fetchAllDependencies(project, (depKey, status, count) => {
        setSyncProgress(prev => ({ ...prev, [depKey]: { status, count } }));
      });
      await loadCaches();
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const credentialsReady = project?.fmx_connection_verified;
  const completedCount = Object.values(syncProgress).filter(p => p.status === 'done' || p.status === 'error').length;
  const currentType = syncing ? DEPENDENCY_TYPES.find(d => !syncProgress[d.key]) : null;

  if (loading) {
    return <p style={{ fontSize: 13, color: '#9CA3AF', padding: '2rem 0' }}>Loading dependencies…</p>;
  }

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button
          onClick={handleSync}
          disabled={!credentialsReady || syncing}
          style={{
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: credentialsReady ? ORANGE : '#ccc',
            border: 'none',
            borderRadius: 6,
            cursor: credentialsReady && !syncing ? 'pointer' : 'not-allowed',
            opacity: syncing ? 0.7 : 1,
          }}
        >
          {syncing ? 'Updating…' : 'Update Dependencies'}
        </button>

        {syncing && currentType && (
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            Fetching {currentType.label}… ({completedCount}/{DEPENDENCY_TYPES.length})
          </span>
        )}

        {!syncing && !credentialsReady && (
          <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
            Verify FMX credentials in Settings to enable
          </span>
        )}
      </div>

      {syncError && (
        <div style={{ padding: '8px 14px', marginBottom: 16, background: '#FFF0F0', border: '1px solid #FFCDD2', borderRadius: 6, fontSize: 12, color: '#CF4A12' }}>
          {syncError}
        </div>
      )}

      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 1.6 }}>
        Pull live data from FMX so that cross-sheet references can be validated before import.
        FMX IDs are resolved at push time using cached name→ID mappings.
      </p>

      {/* Dependency cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {DEPENDENCY_TYPES.map(dep => {
          const cache = depCaches[dep.key];
          const progress = syncProgress[dep.key];
          const items = cache?.items || [];
          const count = cache?.totalCount ?? items.length;
          const age = timeAgo(cache?.cachedAt);
          const isFetching = syncing && !progress && currentType?.key === dep.key;
          const isDone = progress?.status === 'done';
          const isError = progress?.status === 'error';

          return (
            <div
              key={dep.key}
              style={{
                background: '#fff',
                border: `1px solid ${isError ? '#FFCDD2' : '#E5E7EB'}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Card header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{dep.label}</span>
                  {isFetching && (
                    <span style={{ fontSize: 11, color: ORANGE, fontWeight: 600 }}>fetching…</span>
                  )}
                  {isDone && (
                    <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>✓ updated</span>
                  )}
                  {isError && (
                    <span style={{ fontSize: 11, color: '#CF4A12', fontWeight: 600 }}>✗ failed</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  {count > 0 && (
                    <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>
                      {count} record{count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {age && (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      Updated {age}
                    </span>
                  )}
                  {!cache && !syncing && (
                    <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>
                      Not yet fetched
                    </span>
                  )}
                </div>
              </div>

              {/* Values list */}
              <div style={{ padding: '10px 20px 14px', maxHeight: 280, overflowY: 'auto' }}>
                {items.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: '4px 0' }}>
                    {cache ? 'No records found in FMX' : 'Click "Update Dependencies" to fetch'}
                  </p>
                ) : (
                  items.map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '4px 0', borderBottom: '1px solid #F9FAFB',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#E6F4EE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>
                      </div>
                      <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>
                        {item.name}
                        {item.email && (
                          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>{item.email}</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
