import { useState, useEffect } from 'react';
import {
  getExtractionRun,
  getPromptById,
  getCorrectionsForRun,
  getPdfSignedUrl,
  downloadPdfFromStorage,
} from '../db';
import { extractPdfToSheet } from '../pdfExtract';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const BORDER = '#E5E7EB';

// Detail view for one extraction_runs row. Shows the result JSON, the exact
// prompt version used, linked corrections, and two actions:
//   • Download original PDF — signed URL against the pdf-uploads bucket
//   • Re-run with current active prompt — downloads the PDF, kicks a new
//     extraction. Lets admins verify that a promoted example actually fixed
//     the issue without leaving the app.
export default function RunDetailModal({ runId, currentUserId, onClose }) {
  const [run, setRun] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunProgress, setRerunProgress] = useState(null);
  const [rerunResult, setRerunResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await getExtractionRun(runId);
      if (cancelled) return;
      setRun(r);
      if (r?.prompt_id) {
        const p = await getPromptById(r.prompt_id);
        if (!cancelled) setPrompt(p);
      }
      const cs = await getCorrectionsForRun(runId);
      if (!cancelled) setCorrections(cs);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [runId]);

  const handleDownloadPdf = async () => {
    if (!run?.storage_key) return;
    const url = await getPdfSignedUrl(run.storage_key, 300);
    if (!url) { alert('Could not generate download link (file may have been deleted).'); return; }
    window.open(url, '_blank');
  };

  const handleRerun = async () => {
    if (!run?.storage_key) { alert('No stored PDF for this run — cannot re-run.'); return; }
    setRerunBusy(true);
    setRerunResult(null);
    setRerunProgress({ label: 'Downloading original PDF…' });
    try {
      const file = await downloadPdfFromStorage(run.storage_key, run.source_filename || 'rerun.pdf');
      if (!file) throw new Error('Download failed');
      const result = await extractPdfToSheet(file, run.migration_type, {
        projectId: run.project_id,
        userId: currentUserId,
        onProgress: (label, progress) => setRerunProgress({ label, ...progress }),
      });
      setRerunResult({
        ok: true,
        runId: result.runId,
        pageCount: result.pageCount,
        rowCount: result.rows.length,
        headers: result.headers,
        rows: result.rows,
      });
    } catch (err) {
      setRerunResult({ ok: false, error: err?.message || String(err) });
    } finally {
      setRerunBusy(false);
      setRerunProgress(null);
    }
  };

  const resultRows = Array.isArray(run?.result_json?.headers) ? run.result_json : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY }}>
              Extraction Run
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9CA3AF', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {runId}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 28, fontSize: 13, color: '#6B7280' }}>Loading…</div>
        ) : !run ? (
          <div style={{ padding: 28, fontSize: 13, color: '#B91C1C' }}>Run not found.</div>
        ) : (
          <div style={{ padding: '16px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 6, columnGap: 12, fontSize: 12 }}>
              <Meta label="Stage" value={(run.stage || 'extraction') === 'field_mapping' ? 'CSV field mapping' : 'PDF extraction'} />
              <Meta label="Migration type" value={<strong>{run.migration_type}</strong>} />
              <Meta label="File" value={run.source_filename || '—'} />
              {(run.stage || 'extraction') === 'extraction' && (
                <Meta label="Pages" value={run.page_count ?? '—'} />
              )}
              <Meta label="Prompt version" value={`v${run.prompt_version ?? '?'} ${prompt?.active ? '(still active)' : '(historical)'}`} />
              <Meta label="Status" value={
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: statusBg(run.status), color: statusFg(run.status) }}>
                  {run.status.toUpperCase()}
                </span>
              } />
              <Meta label="Duration" value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'} />
              <Meta label="Tokens" value={
                run.input_tokens != null
                  ? `${run.input_tokens.toLocaleString()} in / ${(run.output_tokens || 0).toLocaleString()} out`
                  : '—'
              } />
              <Meta label="Est. cost" value={run.estimated_cost_usd != null ? `$${Number(run.estimated_cost_usd).toFixed(4)}` : '—'} />
              <Meta label="Created" value={run.created_at ? new Date(run.created_at).toLocaleString() : '—'} />
              {run.error && <Meta label="Error" value={<span style={{ color: '#B91C1C' }}>{run.error}</span>} />}
            </div>

            {/* Actions — PDF runs only; field_mapping runs have no PDF to download/re-run. */}
            {(run.stage || 'extraction') === 'extraction' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleDownloadPdf}
                disabled={!run.storage_key}
                style={btnSecondary(!run.storage_key)}
                title={run.storage_key ? 'Open original PDF in new tab (signed URL, 5-min expiry)' : 'No stored file'}
              >📄 Download original PDF</button>
              <button
                onClick={handleRerun}
                disabled={rerunBusy || !run.storage_key}
                style={btnPrimary(rerunBusy || !run.storage_key)}
              >{rerunBusy ? 'Re-running…' : '↻ Re-run with current active prompt'}</button>
            </div>
            )}

            {rerunProgress && (
              <div style={{ padding: 10, border: `1px solid ${BORDER}`, borderRadius: 6, background: '#F9FAFB', fontSize: 12 }}>
                <strong style={{ color: NAVY }}>{rerunProgress.label}</strong>
                {rerunProgress.current != null && rerunProgress.total != null && (
                  <> — {rerunProgress.current}/{rerunProgress.total}</>
                )}
              </div>
            )}

            {rerunResult && !rerunResult.ok && (
              <div style={{
                padding: 12, borderRadius: 6, fontSize: 12,
                border: `1px solid #FECACA`, background: '#FEF2F2', color: '#B91C1C',
              }}>
                <strong>Re-run failed:</strong> {rerunResult.error}
              </div>
            )}
            {rerunResult?.ok && (
              <RerunCompare
                originalHeaders={resultRows?.headers || []}
                originalRowCount={resultRows?.rowCount ?? 0}
                rerun={rerunResult}
              />
            )}

            {/* Corrections on this run */}
            <Section title={`User corrections on this run (${corrections.length})`}>
              {corrections.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No corrections captured.</div>
              ) : (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', maxHeight: 180 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        <th style={th}>Kind</th>
                        <th style={th}>Field</th>
                        <th style={th}>Row</th>
                        <th style={th}>Original</th>
                        <th style={th}>Corrected</th>
                        <th style={th}>Promoted?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corrections.map(c => (
                        <tr key={c.id} style={{ borderBottom: `1px solid #F3F4F6` }}>
                          <td style={td}>{
                            c.correction_type === 'header_rename' ? 'HEADER'
                            : c.correction_type === 'mapping_change' ? 'MAPPING'
                            : c.correction_type === 'validate_edit' ? 'VALIDATE'
                            : 'CELL'
                          }</td>
                          <td style={td}>{c.field_path}</td>
                          <td style={td}>{c.row_index ?? '—'}</td>
                          <td style={{ ...td, color: '#B91C1C', fontFamily: 'ui-monospace, Menlo, monospace' }}>{c.original_value ?? '∅'}</td>
                          <td style={{ ...td, color: '#166534', fontFamily: 'ui-monospace, Menlo, monospace' }}>{c.corrected_value ?? '∅'}</td>
                          <td style={td}>{c.promoted_example_id ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Result snapshot */}
            <Section title="Result snapshot">
              {resultRows ? (
                <div style={{ fontSize: 12, color: '#374151' }}>
                  <div>Headers ({resultRows.headers.length}): <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#6B7280' }}>{resultRows.headers.join(' · ')}</span></div>
                  <div style={{ marginTop: 4 }}>Row count: <strong>{resultRows.rowCount}</strong></div>
                  <div style={{ marginTop: 4, color: '#9CA3AF' }}>Model: {resultRows.model || '—'}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No result snapshot.</div>
              )}
            </Section>

            {/* Prompt body used */}
            <Section title={`Prompt body used (v${run.prompt_version ?? '?'})`}>
              {prompt?.body ? (
                <pre style={{
                  margin: 0, padding: 10, borderRadius: 6,
                  border: `1px solid ${BORDER}`, background: '#FAFAFA',
                  fontSize: 11, lineHeight: 1.45, maxHeight: 240, overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, monospace',
                }}>{prompt.body}</pre>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Prompt record not found (may have been deleted).</div>
              )}
            </Section>
          </div>
        )}

        <div style={{ padding: '12px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ fontSize: 13, padding: '7px 18px', borderRadius: 6, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer' }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

// Side-by-side comparison of the original run vs a just-finished re-run.
// Since we only store result headers + row counts on the original run (not full
// rows), the reconciliation is header-set diff + row-count delta. Still enough
// for admins to see if a promoted example actually changed the output shape.
function RerunCompare({ originalHeaders, originalRowCount, rerun }) {
  const rerunHeaders = rerun.headers || [];
  const origSet = new Set(originalHeaders);
  const rerunSet = new Set(rerunHeaders);
  const added = rerunHeaders.filter(h => !origSet.has(h));
  const removed = originalHeaders.filter(h => !rerunSet.has(h));
  const shared = rerunHeaders.filter(h => origSet.has(h));
  const rowDelta = (rerun.rowCount ?? 0) - (originalRowCount ?? 0);
  const unchanged = added.length === 0 && removed.length === 0 && rowDelta === 0;

  return (
    <div style={{
      padding: 12, borderRadius: 6, fontSize: 12,
      border: `1px solid #BBF7D0`, background: '#F0FDF4', color: '#166534',
    }}>
      <strong>Re-run complete.</strong> {rerun.rowCount} rows from {rerun.pageCount} pages.
      {' '}New run id: <code style={{ fontSize: 11 }}>{rerun.runId}</code>.
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, color: '#374151' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            Original ({originalRowCount} rows)
          </div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, lineHeight: 1.5 }}>
            {originalHeaders.length
              ? originalHeaders.map(h => (
                  <div key={h} style={{ color: rerunSet.has(h) ? '#374151' : '#B91C1C', textDecoration: rerunSet.has(h) ? 'none' : 'line-through' }}>
                    {h}
                  </div>
                ))
              : <span style={{ color: '#9CA3AF' }}>(no headers)</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            Re-run ({rerun.rowCount} rows)
          </div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, lineHeight: 1.5 }}>
            {rerunHeaders.map(h => (
              <div key={h} style={{ color: origSet.has(h) ? '#374151' : '#166534', fontWeight: origSet.has(h) ? 400 : 600 }}>
                {origSet.has(h) ? h : `+ ${h}`}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: '#374151', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>Shared: <strong>{shared.length}</strong></span>
        <span style={{ color: '#166534' }}>Added: <strong>{added.length}</strong></span>
        <span style={{ color: '#B91C1C' }}>Removed: <strong>{removed.length}</strong></span>
        <span style={{ color: rowDelta === 0 ? '#6B7280' : rowDelta > 0 ? '#166534' : '#B91C1C' }}>
          Row delta: <strong>{rowDelta > 0 ? `+${rowDelta}` : rowDelta}</strong>
        </span>
        {unchanged && <span style={{ color: '#6B7280', fontStyle: 'italic' }}>(output shape unchanged — prompt produced the same headers & row count)</span>}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <>
      <div style={{ color: '#9CA3AF', fontSize: 11 }}>{label}</div>
      <div>{value}</div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {title}
      </div>
      {children}
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
function btnPrimary(disabled) {
  return {
    fontSize: 12, padding: '7px 14px', borderRadius: 5,
    background: ORANGE, color: '#fff', border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}
function btnSecondary(disabled) {
  return {
    fontSize: 12, padding: '7px 14px', borderRadius: 5,
    background: '#fff', color: NAVY, border: `1px solid #D1D5DB`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

const th = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: `1px solid ${BORDER}`, fontSize: 10, whiteSpace: 'nowrap',
};
const td = { padding: '6px 10px', verticalAlign: 'middle' };
