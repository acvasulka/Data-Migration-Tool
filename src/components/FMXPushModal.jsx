import { useState, useEffect, useRef } from "react";
import { C } from "../theme";
import Modal from "./Modal";
import { resolveEndpoint, FMX_ASSIGNMENT_FIELDS } from "../fmxEndpoints";
import { transformRowToPayload, buildIdCache, fetchAllRecords } from "../fmxTransform";
import { deriveFieldMap, deriveLookupFields } from "../fmxFieldMetadata";
import { decodeCredentials } from "../fmxSync";
import { fmxFetch } from "../apiClient";
import { downloadCSV } from "../utils";
import { getAllDependencyCaches } from "../db";
import { validatePayload, applyDefaults } from "../fmxValidation";

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

export default function FMXPushModal({
  schemaType,
  mappedRows,
  projectId,
  fmxSiteUrl,
  fmxEmail,
  fmxCredentials,
  fmxModules,
  customFieldIdMap,
  customFieldMetadata,
  systemFieldMetadata,
  allFields,
  onClose,
  onSuccess,
}) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'validating' | 'pushing' | 'done'
  const [pushMode, setPushMode] = useState('create'); // 'create' | 'update'
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
  const [connStatus, setConnStatus] = useState(null);
  const [connMsg, setConnMsg] = useState('');
  const [connLoading, setConnLoading] = useState(false);

  const effectiveEmail = useSaved && fmxCredentials ? decodeCredentials(fmxCredentials).email : email;
  const effectivePassword = useSaved && fmxCredentials ? decodeCredentials(fmxCredentials).password : password;

  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [recentRows, setRecentRows] = useState([]);
  const [pushed, setPushed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [failedRows, setFailedRows] = useState([]);

  // Validation state
  const [validationResult, setValidationResult] = useState(null);
  const [skipInvalid, setSkipInvalid] = useState(true);

  const cancelledRef = useRef(false);
  const canPush = siteUrl.trim() && effectiveEmail.trim() && (useSaved ? !!fmxCredentials : password.trim());

  const testConnection = async () => {
    setConnLoading(true); setConnStatus(null);
    try {
      const res = await fmxFetch({
        siteUrl: siteUrl.trim(), email: effectiveEmail.trim(), password: effectivePassword,
        endpoint: '/v1/buildings?limit=1', method: 'GET',
      });
      if (res.ok || res.status === 200) {
        setConnStatus('ok');
        setConnMsg(`\u2713 Connected to ${siteUrl.trim()}`);
      } else {
        setConnStatus('fail');
        setConnMsg(`\u2715 Connection failed (${res.status}) \u2014 check URL and credentials`);
      }
    } catch {
      setConnStatus('fail');
      setConnMsg('\u2715 Connection failed \u2014 check URL and credentials');
    }
    setConnLoading(false);
  };

  // Validation phase — transforms all rows, validates, then shows results
  useEffect(() => {
    if (phase !== 'validating') return;
    cancelledRef.current = false;

    (async () => {
      const url = siteUrl.trim();
      const em = effectiveEmail.trim();
      const pw = effectivePassword;

      // Derive dynamic field/lookup maps from allFields
      const dynFieldMap = allFields?.length ? deriveFieldMap(allFields) : null;
      const dynLookups = allFields?.length ? deriveLookupFields(allFields) : null;

      // Step 1: Build ID cache
      setStatusMsg('Resolving reference IDs\u2026');
      let idCache = {};
      try {
        const depCaches = projectId ? await getAllDependencyCaches(projectId) : [];
        const result = await buildIdCache(mappedRows, schemaType, url, em, pw, depCaches, dynLookups);
        idCache = result.idCache;
        if (result.unresolved?.length > 0) {
          console.warn('Unresolved references:', result.unresolved);
        }
      } catch {}

      if (cancelledRef.current) return;
      idCacheRef.current = idCache;

      // Step 2: Transform all rows and validate
      setStatusMsg('Validating payloads\u2026');
      const sysFields = systemFieldMetadata || [];
      const cfMeta = customFieldMetadata || [];
      const cfIdMap = customFieldIdMap || {};

      const payloads = mappedRows.map(row => {
        const p = transformRowToPayload(row, schemaType, idCache, cfIdMap, cfMeta, dynFieldMap, dynLookups);
        applyDefaults(p, sysFields, cfMeta);
        return p;
      });
      payloadsRef.current = payloads;

      // Validate each payload
      let validCount = 0, invalidCount = 0;
      const rowErrors = [];
      for (let i = 0; i < payloads.length; i++) {
        const { errors, warnings } = validatePayload(payloads[i], sysFields, cfMeta);
        if (errors.length > 0) {
          invalidCount++;
          rowErrors.push({ rowIndex: i, errors, warnings });
        } else {
          validCount++;
        }
      }

      setValidationResult({ validCount, invalidCount, rowErrors });

      // If no errors, skip straight to pushing
      if (invalidCount === 0) {
        setPhase('pushing');
      }
    })();
  }, [phase]);

  // Store refs so push phase can access without re-triggering
  const idCacheRef = useRef({});
  const payloadsRef = useRef([]);
  const createdIdsRef = useRef({});

  // Push phase — sends validated payloads to FMX
  useEffect(() => {
    if (phase !== 'pushing') return;
    cancelledRef.current = false;

    (async () => {
      const endpoint = resolveEndpoint(schemaType, fmxModules);
      const url = siteUrl.trim();
      const em = effectiveEmail.trim();
      const pw = effectivePassword;

      // Derive dynamic field/lookup maps from allFields
      const dynFieldMap = allFields?.length ? deriveFieldMap(allFields) : null;
      const dynLookups = allFields?.length ? deriveLookupFields(allFields) : null;

      // Use pre-built payloads if available (from validation phase)
      // Otherwise build them now (when validation was skipped)
      let payloads = payloadsRef.current;
      let idCache = idCacheRef.current;
      if (!payloads || payloads.length === 0) {
        setStatusMsg('Preparing \u2014 resolving reference IDs\u2026');
        try {
          const depCaches = projectId ? await getAllDependencyCaches(projectId) : [];
          const result = await buildIdCache(mappedRows, schemaType, url, em, pw, depCaches, dynLookups);
          idCache = result.idCache;
        } catch {}
        if (cancelledRef.current) return;
        payloads = mappedRows.map(row =>
          transformRowToPayload(row, schemaType, idCache, customFieldIdMap || {}, customFieldMetadata || [], dynFieldMap, dynLookups)
        );
      }

      // For update mode: build a name->id map of existing entities
      let existingEntityMap = {};
      if (pushMode === 'update') {
        setStatusMsg('Fetching existing records for update\u2026');
        try {
          const nameKey = payloads[0]?.tag !== undefined ? 'tag' : 'name';
          const records = await fetchAllRecords(url, em, pw, endpoint, `id,${nameKey}`);
          for (const r of records) {
            const key = String(r[nameKey] || '').toLowerCase().trim();
            if (key) existingEntityMap[key] = r.id;
          }
        } catch (e) {
          console.warn('Could not fetch existing records for update mode:', e);
        }
      }

      if (cancelledRef.current) return;

      // Determine which rows to push (skip invalid if user chose to)
      const invalidIndices = new Set(
        (validationResult?.rowErrors || []).filter(e => e.errors.length > 0).map(e => e.rowIndex)
      );

      const total = payloads.length;
      let successCount = 0;
      let failCount = 0;
      const failures = [];
      const createdIds = {};

      for (let i = 0; i < payloads.length; i++) {
        if (cancelledRef.current) break;

        // Skip invalid rows if user chose to
        if (skipInvalid && invalidIndices.has(i)) {
          failCount++;
          failures.push({ ...mappedRows[i], _fmxError: 'Skipped \u2014 failed pre-push validation' });
          setRecentRows(prev => [{ name: mappedRows[i]['Name'] || mappedRows[i]['Tag'] || `Row ${i + 1}`, ok: false }, ...prev].slice(0, 5));
          setPushed(successCount);
          setFailed(failCount);
          continue;
        }

        const row = mappedRows[i];
        const rowName = row['Name'] || row['Tag'] || row['Email'] || `Row ${i + 1}`;
        const action = pushMode === 'update' ? 'Updating' : 'Pushing';
        setStatusMsg(`${action} row ${i + 1} of ${total}\u2026`);
        setProgress(Math.round(((i) / total) * 100));

        let ok = false;
        let errorMsg = '';
        try {
          let reqEndpoint = endpoint;
          let httpMethod = 'POST';

          if (pushMode === 'update') {
            const nameVal = (row['Name'] || row['Tag'] || '').toLowerCase().trim();
            const existingId = existingEntityMap[nameVal];
            if (!existingId) {
              failCount++;
              failures.push({ ...row, _fmxError: `No existing record found matching "${row['Name'] || row['Tag']}"` });
              setRecentRows(prev => [{ name: rowName, ok: false }, ...prev].slice(0, 5));
              setPushed(successCount);
              setFailed(failCount);
              continue;
            }
            reqEndpoint = `${endpoint}/${existingId}`;
            httpMethod = 'PUT';
          }

          const res = await fmxFetch({ siteUrl: url, email: em, password: pw, endpoint: reqEndpoint, method: httpMethod, payload: payloads[i] });
          ok = res.ok || res.status === 200 || res.status === 201;

          // Parse response for created/updated ID or error message
          try {
            const respData = await res.json();
            if (ok && respData?.id) {
              createdIds[i] = respData.id;
            }
            if (!ok) {
              errorMsg = respData?.message
                || respData?.error
                || (respData?.errors ? JSON.stringify(respData.errors) : '')
                || (respData?.validationErrors ? JSON.stringify(respData.validationErrors) : '')
                || (respData?.modelState ? JSON.stringify(respData.modelState) : '')
                || `HTTP ${res.status}`;
            }
          } catch {}
        } catch (e) {
          errorMsg = e.message || 'Network error';
        }

        if (ok) {
          successCount++;

          // Chain assignment for Work Requests after successful create
          const baseType = schemaType.split(':')[0];
          const assignConfig = FMX_ASSIGNMENT_FIELDS[baseType];
          if (assignConfig && createdIds[i] && pushMode === 'create') {
            const assignedUsersRaw = row[assignConfig.userField];
            if (assignedUsersRaw) {
              try {
                const userNames = String(assignedUsersRaw).split(/[;,]/).map(s => s.trim()).filter(Boolean);
                const userIds = userNames.map(name => {
                  const key = `${assignConfig.userField}:${name}`;
                  return idCache[key];
                }).filter(Boolean);

                if (userIds.length > 0) {
                  const assignPayload = { assignedUsers: userIds };
                  const priorityVal = row[assignConfig.priorityField];
                  if (priorityVal) assignPayload.priorityLevel = String(priorityVal);

                  await fmxFetch({
                    siteUrl: url, email: em, password: pw,
                    endpoint: `${endpoint}/${createdIds[i]}/assignments`,
                    payload: assignPayload,
                  });
                }
              } catch (e) {
                console.warn(`Assignment failed for row ${i}:`, e);
              }
            }
          }
        } else {
          failCount++;
          failures.push({ ...row, _fmxError: errorMsg || 'Unknown error' });
        }

        setRecentRows(prev => {
          const entry = { name: rowName, ok };
          return [entry, ...prev].slice(0, 5);
        });
        setPushed(successCount);
        setFailed(failCount);
      }

      createdIdsRef.current = createdIds;
      setProgress(100);
      setFailedRows(failures);
      setPhase('done');
    })();
  }, [phase]);

  const allOk = failed === 0 && phase === 'done';

  return (
    <Modal width={480} onClose={(phase === 'pushing' || phase === 'validating') ? undefined : onClose}>
      <style>{ANIM}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.navy }}>
          {phase === 'setup' && 'Send directly to FMX'}
          {phase === 'validating' && (!validationResult ? 'Validating\u2026' : 'Validation results')}
          {phase === 'pushing' && 'Pushing to FMX\u2026'}
          {phase === 'done' && (allOk ? 'All records pushed!' : 'Push complete')}
        </p>
        {phase !== 'pushing' && phase !== 'validating' && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.textMid, lineHeight: 1, padding: '0 4px' }}>\u00d7</button>
        )}
      </div>

      {/* -- SETUP -- */}
      {phase === 'setup' && (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.textMid }}>
            Push {mappedRows.length} <strong>{schemaType}</strong> records directly via the FMX API.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: C.textDark, display: 'block', marginBottom: 4 }}>FMX site URL</label>
              <input className="fmx-input" style={{ width: '100%', boxSizing: 'border-box' }} value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="yoursite.gofmx.com" />
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
                  <input className="fmx-input" style={{ width: '100%', boxSizing: 'border-box' }} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: C.textDark, display: 'block', marginBottom: 4 }}>API user password</label>
                  <input className="fmx-input" style={{ width: '100%', boxSizing: 'border-box' }} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }} onClick={testConnection} disabled={!canPush || connLoading}>
              {connLoading ? 'Testing\u2026' : 'Test connection'}
            </button>
            {connStatus && (
              <span style={{ fontSize: 12, color: connStatus === 'ok' ? '#1A7F4E' : '#DC2626', fontWeight: 500 }}>{connMsg}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {['create', 'update'].map(mode => (
              <button key={mode} onClick={() => setPushMode(mode)} style={{
                flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${pushMode === mode ? C.orange : C.border}`,
                background: pushMode === mode ? '#FFF7ED' : C.white,
                color: pushMode === mode ? C.orange : C.textMid,
              }}>
                {mode === 'create' ? 'Create new records' : 'Update existing records'}
              </button>
            ))}
          </div>

          <button className="fmx-btn-primary" style={{ width: '100%', marginTop: 12, fontSize: 13, padding: '10px 0' }} disabled={!canPush} onClick={() => setPhase('validating')}>
            {pushMode === 'create' ? `Push ${mappedRows.length} records to FMX \u2192` : `Update ${mappedRows.length} records in FMX \u2192`}
          </button>
        </div>
      )}

      {/* -- VALIDATING -- */}
      {phase === 'validating' && !validationResult && (
        <div>
          <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 12px' }}>{statusMsg || 'Preparing\u2026'}</p>
          <div style={{ height: 8, background: C.bgPage, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '50%', background: C.orange, borderRadius: 4, animation: 'fmx-check-fade 1s ease infinite alternate' }} />
          </div>
        </div>
      )}

      {phase === 'validating' && validationResult && validationResult.invalidCount > 0 && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, background: '#E6F7EF', borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1A7F4E' }}>{validationResult.validCount}</div>
              <div style={{ fontSize: 11, color: '#1A7F4E', fontWeight: 500, marginTop: 2 }}>Valid</div>
            </div>
            <div style={{ flex: 1, background: '#FEE2E2', borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#DC2626' }}>{validationResult.invalidCount}</div>
              <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 500, marginTop: 2 }}>Invalid</div>
            </div>
          </div>

          {validationResult.rowErrors.slice(0, 5).map((re, i) => (
            <div key={i} style={{ background: C.bgPage, borderRadius: 6, padding: '6px 10px', marginBottom: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: C.textDark }}>Row {re.rowIndex + 1}:</span>{' '}
              <span style={{ color: '#DC2626' }}>{re.errors.join('; ')}</span>
            </div>
          ))}
          {validationResult.rowErrors.length > 5 && (
            <p style={{ fontSize: 11, color: C.textLight, margin: '4px 0 0' }}>\u2026and {validationResult.rowErrors.length - 5} more</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="fmx-btn-secondary" style={{ flex: 1, fontSize: 12, padding: '8px 0' }} onClick={() => { cancelledRef.current = true; setValidationResult(null); setPhase('setup'); }}>Back</button>
            <button className="fmx-btn-primary" style={{ flex: 1, fontSize: 12, padding: '8px 0' }} onClick={() => { setSkipInvalid(true); setPhase('pushing'); }}>
              Push {validationResult.validCount} valid rows
            </button>
          </div>
        </div>
      )}

      {/* -- PUSHING -- */}
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
                  <span style={{ color: r.ok ? '#1A7F4E' : '#DC2626', fontWeight: 700, fontSize: 13 }}>{r.ok ? '\u2713' : '\u2715'}</span>
                  <span style={{ color: r.ok ? C.textDark : '#DC2626' }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}

          <button style={{ marginTop: 14, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 16px', fontSize: 12, color: C.textMid, cursor: 'pointer' }}
            onClick={() => { cancelledRef.current = true; setPhase('done'); }}>
            Cancel
          </button>
        </div>
      )}

      {/* -- DONE -- */}
      {phase === 'done' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            {allOk ? (
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'fmx-check-fade 0.4s ease' }}>
                <circle cx="28" cy="28" r="26" fill="#E6F7EF" stroke="#1A7F4E" strokeWidth="2" />
                <polyline points="16,28 24,36 40,20" fill="none" stroke="#1A7F4E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset="0" style={{ animation: 'fmx-check-draw 0.5s ease forwards' }} />
              </svg>
            ) : (
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'fmx-check-fade 0.4s ease' }}>
                <circle cx="28" cy="28" r="26" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
                <text x="28" y="36" textAnchor="middle" fontSize="24" fill="#D97706">!</text>
              </svg>
            )}
          </div>

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
            <div style={{ marginBottom: 12 }}>
              {failedRows.slice(0, 3).map((row, i) => (
                <div key={i} style={{ background: '#FEF2F2', borderRadius: 6, padding: '6px 10px', marginBottom: 4, fontSize: 11 }}>
                  <span style={{ fontWeight: 600, color: '#DC2626' }}>{row['Name'] || row['Tag'] || row['Email'] || 'Row'}:</span>{' '}
                  <span style={{ color: '#7F1D1D' }}>{row._fmxError || 'Unknown error'}</span>
                </div>
              ))}
              {failedRows.length > 3 && (
                <p style={{ fontSize: 11, color: C.textLight, margin: '4px 0 0' }}>\u2026and {failedRows.length - 3} more</p>
              )}
              <button
                onClick={() => downloadCSV(`${schemaType.replace(/\s+/g,'_')}_failed_rows.csv`, Object.keys(failedRows[0]), failedRows)}
                style={{ display: 'block', fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 8, padding: 0 }}
              >
                Download {failedRows.length} failed row{failedRows.length !== 1 ? 's' : ''} as CSV
              </button>
            </div>
          )}

          {allOk && Object.keys(createdIdsRef.current).length > 0 && (
            <p style={{ fontSize: 11, color: C.textLight, margin: '0 0 12px' }}>
              {Object.keys(createdIdsRef.current).length} FMX record ID{Object.keys(createdIdsRef.current).length !== 1 ? 's' : ''} captured
            </p>
          )}

          <button className="fmx-btn-primary" style={{ width: '100%', fontSize: 13, padding: '10px 0' }} onClick={onSuccess}>Done</button>
        </div>
      )}
    </Modal>
  );
}
