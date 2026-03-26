import { useState, useEffect } from "react";
import { getAllReferenceValues } from "../db";

const NAVY = '#041662';
const GREEN = '#1A7F4E';

const DEPENDENCY_CHAINS = [
  { provider: 'Building',       consumers: ['Resource', 'User', 'Equipment', 'Inventory', 'Work Request', 'Schedule Request', 'Work Task', 'Transportation Request'] },
  { provider: 'Equipment Type', consumers: ['Equipment'] },
  { provider: 'Resource',       consumers: ['Schedule Request', 'Transportation Request'] },
];

export default function DependenciesView({ projectId, refreshKey }) {
  const [refValues, setRefValues] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getAllReferenceValues(projectId).then(data => {
      setRefValues(data || []);
      setLoading(false);
    });
  }, [projectId, refreshKey]);

  // Group by schema type
  const refBySchema = {};
  for (const row of refValues) {
    if (!refBySchema[row.schema_type]) refBySchema[row.schema_type] = [];
    refBySchema[row.schema_type].push(row.value);
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: '#9CA3AF', padding: '2rem 0' }}>Loading dependencies…</p>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 1.6 }}>
        Reference values saved from completed imports. Downstream schema types rely on these to resolve
        cross-sheet links when pushing to FMX. FMX IDs are resolved dynamically at push time.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {DEPENDENCY_CHAINS.map(({ provider, consumers }) => {
          const providerVals = refBySchema[provider] || [];
          const uniqueVals = [...new Set(providerVals)].sort();

          return (
            <div
              key={provider}
              style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Chain header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{provider}</span>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>→</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{consumers.join(', ')}</span>
                </div>
                {uniqueVals.length > 0 && (
                  <p style={{ fontSize: 11, color: GREEN, margin: '4px 0 0', fontWeight: 600 }}>
                    {uniqueVals.length} value{uniqueVals.length !== 1 ? 's' : ''} saved · resolved at push time
                  </p>
                )}
              </div>

              {/* Values list */}
              <div style={{ padding: '10px 20px 14px', maxHeight: 320, overflowY: 'auto' }}>
                {uniqueVals.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: '4px 0' }}>
                    No {provider} data saved yet — complete a {provider} import first.
                  </p>
                ) : (
                  uniqueVals.map(val => (
                    <div
                      key={val}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '5px 0', borderBottom: '1px solid #F9FAFB',
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
                      <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{val}</span>
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
