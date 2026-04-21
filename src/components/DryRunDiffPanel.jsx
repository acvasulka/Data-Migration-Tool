import { useState, useMemo } from 'react';

const NAVY = '#041662';
const BORDER = '#E5E7EB';
const ADDED = '#DCFCE7';
const REMOVED = '#FEE2E2';

// Renders the result of a dry-run next to its source run.
// Always shows the metrics card. The side-by-side diff is collapsed by default
// (row tables can be large) and expands on click.
export default function DryRunDiffPanel({ stage, sourceRun, dryRunResult }) {
  const [expanded, setExpanded] = useState(false);

  const metrics = useMemo(
    () => computeMetrics(stage, sourceRun, dryRunResult),
    [stage, sourceRun, dryRunResult]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {metrics.map(m => (
          <div
            key={m.label}
            title={m.hint || ''}
            style={{
              flex: '1 1 120px', minWidth: 120,
              padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`,
              background: '#F9FAFB',
            }}
          >
            <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: m.color || NAVY, marginTop: 2 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        style={{
          alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 5,
          background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer',
        }}
      >
        {expanded ? 'Hide side-by-side' : 'Show side-by-side'}
      </button>

      {expanded && (
        stage === 'field_mapping'
          ? <MappingDiff sourceRun={sourceRun} dryRunResult={dryRunResult} />
          : <ExtractionDiff sourceRun={sourceRun} dryRunResult={dryRunResult} />
      )}
    </div>
  );
}

function computeMetrics(stage, sourceRun, dr) {
  const costSrc = Number(sourceRun?.estimated_cost_usd) || 0;
  const costNew = Number(dr?.usage?.costUsd) || 0;
  const durSrc = Number(sourceRun?.duration_ms) || 0;
  const durNew = Number(dr?.durationMs) || 0;
  const tokSrc = (Number(sourceRun?.input_tokens) || 0) + (Number(sourceRun?.output_tokens) || 0);
  const tokNew = (Number(dr?.usage?.inputTokens) || 0) + (Number(dr?.usage?.outputTokens) || 0);

  const shared = [
    {
      label: 'Cost',
      value: `$${costNew.toFixed(4)}`,
      sub: `Δ ${delta(costNew - costSrc, v => `$${v.toFixed(4)}`)} vs source`,
    },
    {
      label: 'Tokens',
      value: tokNew.toLocaleString(),
      sub: `Δ ${delta(tokNew - tokSrc, v => v.toLocaleString())}`,
    },
    {
      label: 'Duration',
      value: `${(durNew / 1000).toFixed(1)}s`,
      sub: `Δ ${delta((durNew - durSrc) / 1000, v => `${v.toFixed(1)}s`)}`,
    },
  ];

  if (stage === 'field_mapping') {
    const srcMap = sourceRun?.result_json?.mapping || {};
    const newMap = dr?.mapping || {};
    const { changed, total } = diffMapping(srcMap, newMap);
    shared.push({
      label: 'Mappings changed',
      value: `${changed} / ${total}`,
      color: changed > 0 ? '#B45309' : '#166534',
    });
  } else {
    const srcHeaders = sourceRun?.result_json?.headers || [];
    const newHeaders = dr?.headers || [];
    const headerDelta = symmetricDiffCount(srcHeaders, newHeaders);
    const srcRows = sourceRun?.result_json?.rowCount ?? sourceRun?.result_json?.rows?.length ?? 0;
    const newRows = dr?.rows?.length ?? 0;
    shared.push({
      label: 'Headers changed',
      value: String(headerDelta),
      color: headerDelta > 0 ? '#B45309' : '#166534',
    });
    shared.push({
      label: 'Row count',
      value: newRows.toLocaleString(),
      sub: `Δ ${delta(newRows - srcRows, v => v.toLocaleString())}`,
    });
  }
  return shared;
}

function delta(n, fmt) {
  if (!n) return '0';
  const sign = n > 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(n))}`;
}

function symmetricDiffCount(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  let n = 0;
  for (const x of sa) if (!sb.has(x)) n++;
  for (const x of sb) if (!sa.has(x)) n++;
  return n;
}

function diffMapping(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let changed = 0;
  for (const k of keys) {
    if ((a?.[k] ?? null) !== (b?.[k] ?? null)) changed++;
  }
  return { changed, total: keys.size };
}

// ── Side-by-side: field_mapping ──────────────────────────────────────────────
function MappingDiff({ sourceRun, dryRunResult }) {
  const srcMap = sourceRun?.result_json?.mapping || {};
  const newMap = dryRunResult?.mapping || {};
  const fields = Array.from(new Set([...Object.keys(srcMap), ...Object.keys(newMap)])).sort();

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', maxHeight: 360 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
            <th style={th}>FMX field</th>
            <th style={th}>Source run</th>
            <th style={th}>Dry-run</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => {
            const a = srcMap[f] ?? null;
            const b = newMap[f] ?? null;
            const diff = a !== b;
            return (
              <tr key={f} style={{ borderBottom: `1px solid #F3F4F6` }}>
                <td style={{ ...td, fontWeight: 500 }}>{f}</td>
                <td style={{ ...td, background: diff ? REMOVED : undefined, color: a == null ? '#9CA3AF' : '#111827' }}>{a ?? '—'}</td>
                <td style={{ ...td, background: diff ? ADDED : undefined, color: b == null ? '#9CA3AF' : '#111827' }}>{b ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Side-by-side: extraction ─────────────────────────────────────────────────
function ExtractionDiff({ sourceRun, dryRunResult }) {
  const srcHeaders = sourceRun?.result_json?.headers || [];
  const newHeaders = dryRunResult?.headers || [];
  const srcRowsSample = sourceRun?.result_json?.rows || [];
  const newRowsSample = dryRunResult?.rows || [];
  const allHeaders = Array.from(new Set([...srcHeaders, ...newHeaders]));
  const sampleCount = Math.min(Math.max(srcRowsSample.length, newRowsSample.length), 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 4 }}>Headers</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <div style={{ flex: 1, padding: 8, background: '#F9FAFB', borderRadius: 4, border: `1px solid ${BORDER}` }}>
            <div style={{ color: '#6B7280', marginBottom: 4 }}>Source</div>
            {allHeaders.map(h => (
              <div key={h} style={{ padding: '2px 0', background: srcHeaders.includes(h) ? (newHeaders.includes(h) ? undefined : REMOVED) : 'transparent', color: srcHeaders.includes(h) ? '#111827' : '#9CA3AF' }}>
                {srcHeaders.includes(h) ? h : '—'}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 8, background: '#F9FAFB', borderRadius: 4, border: `1px solid ${BORDER}` }}>
            <div style={{ color: '#6B7280', marginBottom: 4 }}>Dry-run</div>
            {allHeaders.map(h => (
              <div key={h} style={{ padding: '2px 0', background: newHeaders.includes(h) ? (srcHeaders.includes(h) ? undefined : ADDED) : 'transparent', color: newHeaders.includes(h) ? '#111827' : '#9CA3AF' }}>
                {newHeaders.includes(h) ? h : '—'}
              </div>
            ))}
          </div>
        </div>
      </div>

      {sampleCount > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
            Sample rows (first {sampleCount})
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SampleRowsTable label="Source" headers={srcHeaders} rows={srcRowsSample.slice(0, sampleCount)} />
            <SampleRowsTable label="Dry-run" headers={newHeaders} rows={newRowsSample.slice(0, sampleCount)} />
          </div>
        </div>
      )}
    </div>
  );
}

function SampleRowsTable({ label, headers, rows }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'auto', maxHeight: 240 }}>
      <div style={{ fontSize: 10, color: '#6B7280', padding: '4px 8px', background: '#F9FAFB' }}>{label}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {headers.map(h => <th key={h} style={{ ...th, fontSize: 10 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid #F3F4F6` }}>
              {headers.map(h => <td key={h} style={{ ...td, fontSize: 11 }}>{r[h] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: `1px solid ${BORDER}`, fontSize: 11, whiteSpace: 'nowrap',
};
const td = { padding: '5px 10px', verticalAlign: 'top' };
