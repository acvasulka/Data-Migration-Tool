import { useState, useEffect, useRef } from "react";
import { C } from "../theme";
import Modal from "./Modal";
import { FMX_ENDPOINTS } from "../fmxEndpoints";
import { transformRowToPayload, buildIdCache } from "../fmxTransform";
import { decodeCredentials } from "../fmxSync";

const ANIM = `
  @keyframes fmx-check-draw {
    from { stroke-dashoffset: 60; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes fmx-check-fade {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }
`;

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(','), ...rows.map(r =>
    headers.map(h => {
      const v = String(r[h] ?? '');
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  )];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function FMXPushModal({
  schemaType,
  mappedRows,
  projectId,
  fmxSiteUrl,
  fmxEmail,
  fmxCredentials,
  customFieldIdMap,
  onClose,
  onSuccess,
}) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'pushing' | 'done'
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [useSaved, setUseSaved] = useState(false);

  const hasSavedCreds = !!fmxCredentials;

  useEffect(() => {
    if (fmxSiteUrl) setSiteUrl(fmxSiteUrl);
    if (fmxCredentials) {
      const { email: savedEmail } = decodeCredentials(fmxCredentials);
      if (savedEmail) { setEmail(savedEmail); setUseSaved(true); }
    } else if (fmxEmail) {
      setEmail(fmxEmail);
    }
  }, [fmxSiteUrl, fmxEmail, fmxCredentials]);
  const [password, setPassword] = useState('');
  const [connStatus, setConnStatus] = useState(null); // null | 'ok' | 'fail'
  const [connMsg, setConnMsg] = useState('');
  const [connLoading, setConnLoading] = useState(false);

  // Resolve effective credentials for push
  const effectiveEmail = useSaved && fmxCredentials ? decodeCredentials(fmxCredentials).email : email;
  const effectivePassword = useSaved && fmxCredentials ? decodeCredentials(fmxCredentials).password : password;

  const [progress, setProgress] = useState(0); // 0–100
  const [statusMsg, setStatusMsg] = useState('');
  const [recentRows, setRecentRows] = useState([]); // last 5 processed
  const [pushed, setPushed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [failedRows, setFailedRows] = useState([]);

  const cancelledRef = useRef(false);
  const canPush = siteUrl.trim() && effectiveEmail.trim() && (useSaved ? !!fmxCredentials : password.trim());

  const testConnection = async () => {
    setConnLoading(true); setConnStatus(null);
    try {
      const res = await fetch('/api/fmx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: siteUrl.trim(), email: effectiveEmail.trim(), password: effectivePassword,
          endpoint: '/v1/buildings?limit=1',
          method: 'GET', payload: null,
        }),
      });
      if (res.ok || res.status === 200) {
        setConnStatus('ok');
        setConnMsg(`✓ Connected to ${siteUrl.trim()}`);
      } else {
        setConnStatus('fail');
        setConnMsg(`✕ Connection failed (${res.status}) — check URL and credentials`);
      }
    } catch {
      setConnStatus('fail');
      setConnMsg('✕ Connection failed — check URL and credentials');
    }
    setConnLoading(false);
  };

  // Kick off push when phase switches to 'pushing'
  useEffect(() => {
    if (phase !== 'pushing') return;
    cancelledRef.current = false;

    (async () => {
      const endpoint = FMX_ENDPOINTS[schemaType];
      const url = siteUrl.trim();
      const em = effectiveEmail.trim();
      const pw = effectivePassword;
      const total = mappedRows.length;
      let successCount = 0;
      let failCount = 0;
      const failures = [];

      // Step 1: Build ID cache
      setStatusMsg('Preparing — resolving reference IDs…');
      let idCache = {};
      try {
        idCache = await buildIdCache(mappedRows, schemaType, url, em, pw);
      } catch {}

      if (cancelledRef.current) return;

      // Step 2: Push rows
      for (let i = 0; i < mappedRows.length; i++) {
        if (cancelledRef.current) break;
        const row = mappedRows[i];
        const rowName = row['Name'] || row['Tag'] || row['Email'] || `Row ${i + 1}`;
        setStatusMsg(`Pushing row ${i + 1} of ${total}…`);
        setProgress(Math.round(((i) / total) * 100));

        let ok = false;
        try {
          const payload = transformRowToPayload(row, schemaType, idCache, customFieldIdMap || {});
          const res = await fetch('/api/fmx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteUrl: url, email: em, password: pw, endpoint, payload }),
          });
          ok = res.ok || res.status === 200 || res.status === 201;
        } catch {}

        if (ok) {
          successCount++;
        } else {
          failCount++;
          failures.push(row);
        }

        setRecentRows(prev => {
          const entry = { name: rowName, ok };
          return [entry, ...prev].slice(0, 5);
        });
        setPushed(successCount);
        setFailed(failCount);
      }

      setProgress(100);
      setFailedRows(failures);
      setPhase('done');
    })();
  }, [phase]); // intentionally only runs when phase changes to 'pushing'

  const allOk = failed === 0 && phase === 'done';

  return (
    <Modal width={480} onClose={phase === 'pushing' ? undefined : onClose}>
      <style>{ANIM}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.navy }}>
          {phase === 'setup' && 'Send directly to FMX'}
          {phase === 'pushing' && 'Pushing to FMX…'}
          {phase === 'done' && (allOk ? 'All records pushed!' : 'Push complete')}
        </p>
        {phase !== 'pushing' && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.textMid, lineHeight: 1, padding: '0 4px' }}>×</button>
        )}
      </div>

      {/* ── SETUP ── */}
      {phase === 'setup' && (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.textMid }}>
            Push {mappedRows.length} <strong>{schemaType}</strong> records directly via the FMX API.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: C.textDark, display: 'block', marginBottom: 4 }}>FMX site URL</label>
              <input
                className="fmx-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
                placeholder="yoursite.gofmx.com"
              />
            </div>
            {hasSavedCreds && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textDark, cursor: 'pointer' }}>
                <input type="checkbox" checked={useSaved} onChange={e => setUseSaved(e.target.checked)} style={{ width: 14, height: 14 }} />
                Use saved credentials ({decodeCredentials(fmxCredentials).email})
              </label>
            )}
            {!useSaved && (
              <>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: C.textDark, display: 'block', marginBottom: 4 }}>API user email</label>
                  <input
                    className="fmx-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: C.textDark, display: 'block', marginBottom: 4 }}>API user password</label>
                  <input
                    className="fmx-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button
              className="fmx-btn-secondary"
              style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
              onClick={testConnection}
              disabled={!canPush || connLoading}
            >
              {connLoading ? 'Testing…' : 'Test connection'}
            </button>
            {connStatus && (
              <span style={{ fontSize: 12, color: connStatus === 'ok' ? '#1A7F4E' : '#DC2626', fontWeight: 500 }}>
                {connMsg}
              </span>
            )}
          </div>

          <button
            className="fmx-btn-primary"
            style={{ width: '100%', marginTop: 16, fontSize: 13, padding: '10px 0' }}
            disabled={!canPush}
            onClick={() => setPhase('pushing')}
          >
            Push {mappedRows.length} records to FMX →
          </button>
        </div>
      )}

      {/* ── PUSHING ── */}
      {phase === 'pushing' && (
        <div>
          <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 12px' }}>{statusMsg}</p>
          <div style={{ height: 8, background: C.bgPage, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: C.orange, borderRadius: 4, transition: 'width 0.2s ease' }} />
          </div>
          <p style={{ fontSize: 11, color: C.textLight, margin: '0 0 14px' }}>{progress}%</p>

          {recentRows.length > 0 && (
            <div style={{ background: C.bgPage, borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
              {recentRows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < recentRows.length - 1 ? 4 : 0 }}>
                  <span style={{ color: r.ok ? '#1A7F4E' : '#DC2626', fontWeight: 700, fontSize: 13 }}>{r.ok ? '✓' : '✕'}</span>
                  <span style={{ color: r.ok ? C.textDark : '#DC2626' }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}

          <button
            style={{ marginTop: 14, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 16px', fontSize: 12, color: C.textMid, cursor: 'pointer' }}
            onClick={() => { cancelledRef.current = true; setPhase('done'); }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === 'done' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            {allOk ? (
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'fmx-check-fade 0.4s ease' }}>
                <circle cx="28" cy="28" r="26" fill="#E6F7EF" stroke="#1A7F4E" strokeWidth="2" />
                <polyline
                  points="16,28 24,36 40,20"
                  fill="none" stroke="#1A7F4E" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="60" strokeDashoffset="0"
                  style={{ animation: 'fmx-check-draw 0.5s ease forwards' }}
                />
              </svg>
            ) : (
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'fmx-check-fade 0.4s ease' }}>
                <circle cx="28" cy="28" r="26" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
                <text x="28" y="36" textAnchor="middle" fontSize="24" fill="#D97706">!</text>
              </svg>
            )}
          </div>

          {/* Metric cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Pushed', value: pushed, bg: '#E6F7EF', color: '#1A7F4E' },
              { label: 'Failed', value: failed, bg: failed > 0 ? '#FEE2E2' : C.bgPage, color: failed > 0 ? '#DC2626' : C.textLight },
              { label: 'Total', value: mappedRows.length, bg: '#EEF0F8', color: C.navy },
            ].map(card => (
              <div key={card.label} style={{ flex: 1, background: card.bg, borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: card.color, fontWeight: 500, marginTop: 2 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {failedRows.length > 0 && (
            <button
              onClick={() => downloadCsv(`${schemaType.replace(/\s+/g,'_')}_failed_rows.csv`, failedRows)}
              style={{ display: 'block', fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 12, padding: 0 }}
            >
              Download {failedRows.length} failed row{failedRows.length !== 1 ? 's' : ''} as CSV
            </button>
          )}

          <button
            className="fmx-btn-primary"
            style={{ width: '100%', fontSize: 13, padding: '10px 0' }}
            onClick={onSuccess}
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
