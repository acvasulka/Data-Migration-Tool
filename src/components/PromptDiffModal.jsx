import { useMemo } from 'react';

const NAVY = '#041662';
const BORDER = '#E5E7EB';

// Side-by-side line diff between two prompt bodies. Uses a lightweight LCS
// implementation — plenty fast for prompt-sized text (a few hundred lines
// max in practice) and avoids pulling in a diff library.
export default function PromptDiffModal({ leftLabel, leftBody, rightLabel, rightBody, onClose }) {
  const diff = useMemo(() => computeLineDiff(leftBody || '', rightBody || ''), [leftBody, rightBody]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: '100%', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY }}>
            Prompt diff: <span style={{ color: '#6B7280' }}>{leftLabel}</span> → <span style={{ color: '#6B7280' }}>{rightLabel}</span>
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '10px 14px', fontSize: 11, color: '#6B7280', display: 'flex', gap: 18 }}>
          <span><span style={swatch('#FEE2E2')} /> Removed ({diff.filter(d => d.type === 'del').length})</span>
          <span><span style={swatch('#DCFCE7')} /> Added ({diff.filter(d => d.type === 'add').length})</span>
          <span><span style={swatch('#F3F4F6')} /> Unchanged ({diff.filter(d => d.type === 'eq').length})</span>
        </div>
        <div style={{ overflow: 'auto', padding: '0 20px 16px', flex: 1 }}>
          <pre style={{
            margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.55,
            background: '#FAFAFA', border: `1px solid ${BORDER}`, borderRadius: 6, padding: 0,
          }}>
            {diff.map((d, i) => (
              <div
                key={i}
                style={{
                  padding: '1px 10px',
                  background: d.type === 'add' ? '#DCFCE7' : d.type === 'del' ? '#FEE2E2' : 'transparent',
                  color: d.type === 'add' ? '#166534' : d.type === 'del' ? '#991B1B' : '#374151',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                <span style={{ display: 'inline-block', width: 14, color: '#9CA3AF' }}>
                  {d.type === 'add' ? '+' : d.type === 'del' ? '−' : ' '}
                </span>
                {d.text || ' '}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function swatch(bg) {
  return {
    display: 'inline-block', width: 10, height: 10, borderRadius: 2,
    background: bg, border: `1px solid ${BORDER}`, marginRight: 4, verticalAlign: 'middle',
  };
}

// Line-level LCS diff. Returns an ordered array of { type: 'eq'|'add'|'del', text }.
// O(m*n) time/space — fine for prompt-scale text.
function computeLineDiff(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length, n = bLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: 'eq', text: aLines[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: aLines[i] });
      i++;
    } else {
      out.push({ type: 'add', text: bLines[j] });
      j++;
    }
  }
  while (i < m) { out.push({ type: 'del', text: aLines[i++] }); }
  while (j < n) { out.push({ type: 'add', text: bLines[j++] }); }
  return out;
}
