import { useState, useEffect, useMemo } from "react";
import { C } from "../theme";

const NAVY = '#041662';
const ANIM = `
  @keyframes _drm_spin { to { transform: rotate(360deg); } }
  @keyframes _drm_fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
`;

// ── helpers ────────────────────────────────────────────────────────────────

// Find the crossSheet type for a given column header name
function getCrossSheet(header, allFields) {
  return allFields.find(f => f.name === header)?.crossSheet ?? null;
}

// Collect all dep_error cells grouped by column header:
//   { [header]: { [sourceVal]: occurrenceCount } }
function collectMismatches(rows, cellErrors, allFields, targetHeader) {
  const result = {};
  Object.entries(cellErrors).forEach(([key, val]) => {
    if (val !== "dep_error") return;
    const dashIdx = key.indexOf('-');
    const ri = parseInt(key.slice(0, dashIdx), 10);
    const header = key.slice(dashIdx + 1);
    if (targetHeader && header !== targetHeader) return;
    const crossSheet = getCrossSheet(header, allFields);
    if (!crossSheet) return;
    const sourceVal = rows[ri]?.[header];
    if (!sourceVal) return;
    if (!result[header]) result[header] = {};
    result[header][sourceVal] = (result[header][sourceVal] || 0) + 1;
  });
  return result;
}

// ── Claude suggestion call ─────────────────────────────────────────────────

async function fetchSuggestions(fieldLabel, unrecognizedVals, validNames) {
  if (!unrecognizedVals.length) return {};
  // Cap valid list at 200 to keep prompt manageable
  const cappedValid = validNames.slice(0, 200);
  const prompt = `You are a data migration assistant. Match unrecognized values to the correct FMX names.

Field type: "${fieldLabel}"
Unrecognized values: ${JSON.stringify(unrecognizedVals)}
Valid FMX names: ${JSON.stringify(cappedValid)}

Rules:
- Return ONLY a valid JSON object — no explanation, no markdown fences.
- Keys are the unrecognized values exactly as provided.
- Values are the single best-matching valid FMX name, or null if no confident match exists.
- Use null when similarity is low or ambiguous.

Example: {"Main Bldg": "Main Building", "Unknown-X": null}`;

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(text); }
  catch { return {}; }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, border: `2px solid #E0E0E0`,
      borderTopColor: C.orange, borderRadius: '50%',
      animation: '_drm_spin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

function SuggestionRow({ item, validNames, onChange }) {
  const { sourceVal, occurrences, suggested, accepted } = item;
  const hasMatch = suggested !== null && suggested !== undefined;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr auto auto',
      alignItems: 'center',
      gap: 8,
      padding: '7px 0',
      borderBottom: `1px solid #F3F4F6`,
      animation: '_drm_fadein 0.15s ease',
    }}>
      {/* Source value */}
      <span style={{
        fontSize: 12, color: '#374151', fontFamily: 'monospace',
        background: '#F9FAFB', padding: '3px 7px', borderRadius: 4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={sourceVal}>
        {sourceVal}
      </span>

      {/* Arrow */}
      <span style={{ color: '#9CA3AF', fontSize: 13 }}>→</span>

      {/* Target dropdown */}
      <select
        value={item.overrideVal ?? (hasMatch ? suggested : '')}
        onChange={e => onChange({ ...item, overrideVal: e.target.value || null, accepted: e.target.value ? true : null })}
        style={{
          fontSize: 12, padding: '4px 6px', borderRadius: 5,
          border: `1px solid ${hasMatch ? C.okBorder : C.warnBorder}`,
          background: hasMatch ? C.okBg : '#FFFBE6',
          color: hasMatch ? C.okText : C.warnText,
          outline: 'none', cursor: 'pointer',
        }}
      >
        <option value="">— No confident match found —</option>
        {validNames.map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {/* Occurrences badge */}
      <span style={{
        fontSize: 10, color: '#6B7280', background: '#F3F4F6',
        padding: '2px 6px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        ×{occurrences}
      </span>

      {/* Accept / Reject */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onChange({ ...item, accepted: true })}
          title="Accept"
          style={{
            width: 26, height: 26, border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            background: accepted === true ? C.okBg : '#F3F4F6',
            color: accepted === true ? C.okText : '#6B7280',
            outline: accepted === true ? `2px solid ${C.okBorder}` : 'none',
          }}
        >✓</button>
        <button
          onClick={() => onChange({ ...item, accepted: false })}
          title="Reject — keep original"
          style={{
            width: 26, height: 26, border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            background: accepted === false ? C.errBg : '#F3F4F6',
            color: accepted === false ? C.errText : '#6B7280',
            outline: accepted === false ? `2px solid ${C.errBorder}` : 'none',
          }}
        >✗</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DepResolveModal({ targetHeader, rows, cellErrors, allFields, depCacheMap, onApply, onClose }) {
  // items: array of { header, crossSheet, sourceVal, occurrences, suggested, overrideVal, accepted }
  const [items, setItems] = useState([]);
  const [loadingHeaders, setLoadingHeaders] = useState(new Set());
  const [aiError, setAiError] = useState(null);

  // Collect mismatches once on mount — snapshot only, intentionally not reactive
  // eslint-disable-next-line
  const mismatches = useMemo(() => collectMismatches(rows, cellErrors, allFields, targetHeader), []);

  // Build initial items list once on mount
  useEffect(() => {
    const initial = [];
    for (const [header, valMap] of Object.entries(mismatches)) {
      const crossSheet = getCrossSheet(header, allFields);
      for (const [sourceVal, occurrences] of Object.entries(valMap)) {
        initial.push({ header, crossSheet, sourceVal, occurrences, suggested: undefined, overrideVal: null, accepted: null });
      }
    }
    initial.sort((a, b) => (a.header === b.header ? b.occurrences - a.occurrences : a.header.localeCompare(b.header)));
    setItems(initial);
  }, []); // intentional mount-only

  // Fetch AI suggestions per affected header — runs once on mount
  useEffect(() => {
    const affectedHeaders = Object.keys(mismatches);
    if (!affectedHeaders.length) return;

    setLoadingHeaders(new Set(affectedHeaders));

    (async () => {
      for (const header of affectedHeaders) {
        const crossSheet = getCrossSheet(header, allFields);
        const validNames = depCacheMap?.[crossSheet] ?? [];
        const unrecognized = Object.keys(mismatches[header]);
        try {
          const suggestions = await fetchSuggestions(crossSheet || header, unrecognized, validNames);
          setItems(prev => prev.map(item =>
            item.header === header
              ? {
                  ...item,
                  suggested: suggestions[item.sourceVal] ?? null,
                  accepted: suggestions[item.sourceVal] ? true : null,
                }
              : item
          ));
        } catch (e) {
          setAiError(`AI suggestion failed for "${crossSheet}": ${e.message}`);
        } finally {
          setLoadingHeaders(prev => { const s = new Set(prev); s.delete(header); return s; });
        }
      }
    })();
  }, []); // intentional mount-only

  // Group items by header for display
  const grouped = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!map[item.header]) map[item.header] = [];
      map[item.header].push(item);
    }
    return map;
  }, [items]);

  const updateItem = (header, sourceVal, updated) => {
    setItems(prev => prev.map(item =>
      item.header === header && item.sourceVal === sourceVal ? updated : item
    ));
  };

  const acceptAll = (header = null) => {
    setItems(prev => prev.map(item => {
      if (header && item.header !== header) return item;
      const target = item.overrideVal ?? item.suggested;
      return target ? { ...item, accepted: true } : item;
    }));
  };

  const rejectAll = (header = null) => {
    setItems(prev => prev.map(item => {
      if (header && item.header !== header) return item;
      return { ...item, accepted: false };
    }));
  };

  const handleApply = () => {
    const replacementsByField = {};
    for (const item of items) {
      if (item.accepted !== true) continue;
      const target = item.overrideVal ?? item.suggested;
      if (!target) continue;
      if (!replacementsByField[item.header]) replacementsByField[item.header] = {};
      replacementsByField[item.header][item.sourceVal] = target;
    }
    onApply(replacementsByField);
    onClose();
  };

  const acceptedCount = items.filter(i => i.accepted === true).length;
  const affectedHeaders = Object.keys(grouped);
  const isLoadingAny = loadingHeaders.size > 0;

  const modalTitle = targetHeader
    ? `Fix Dependency Issues — ${getCrossSheet(targetHeader, allFields) ?? targetHeader}`
    : 'Fix All Dependency Issues';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <style>{ANIM}</style>
      <div style={{
        background: '#fff', borderRadius: 12,
        width: '100%', maxWidth: 760,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid #E5E7EB`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY }}>{modalTitle}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
                Claude is suggesting the closest FMX match for each unrecognized value.
                Accept, reject, or pick from the dropdown. Accepted changes apply to all matching cells.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', padding: '0 4px', flexShrink: 0 }}
            >×</button>
          </div>

          {/* Global actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => acceptAll()}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.okBorder}`, background: C.okBg, color: C.okText, cursor: 'pointer', fontWeight: 600 }}
            >✓ Accept All</button>
            <button
              onClick={() => rejectAll()}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.errBorder}`, background: C.errBg, color: C.errText, cursor: 'pointer', fontWeight: 600 }}
            >✗ Reject All</button>
            {isLoadingAny && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
                <Spinner /> Analyzing with AI…
              </span>
            )}
            {aiError && (
              <span style={{ fontSize: 11, color: C.errText }}>{aiError}</span>
            )}
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px' }}>
          {affectedHeaders.length === 0 && (
            <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '32px 0', fontStyle: 'italic' }}>
              No dependency mismatches found.
            </p>
          )}

          {affectedHeaders.map(header => {
            const crossSheet = getCrossSheet(header, allFields);
            const validNames = depCacheMap?.[crossSheet] ?? [];
            const headerItems = grouped[header];
            const isLoading = loadingHeaders.has(header);

            return (
              <div key={header} style={{ marginTop: 20 }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: `2px solid ${C.navy}`,
                  marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{crossSheet ?? header}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      ({headerItems.length} unique value{headerItems.length !== 1 ? 's' : ''})
                    </span>
                    {isLoading && <Spinner />}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => acceptAll(header)}
                      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: `1px solid ${C.okBorder}`, background: C.okBg, color: C.okText, cursor: 'pointer' }}
                    >✓ All</button>
                    <button
                      onClick={() => rejectAll(header)}
                      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: `1px solid ${C.errBorder}`, background: C.errBg, color: C.errText, cursor: 'pointer' }}
                    >✗ All</button>
                  </div>
                </div>

                {/* Column legend */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto auto', gap: 8, padding: '4px 0', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Value</span>
                  <span />
                  <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>FMX Match</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Count</span>
                  <span />
                </div>

                {headerItems.map(item => (
                  <SuggestionRow
                    key={item.sourceVal}
                    item={item}
                    validNames={validNames}
                    onChange={updated => updateItem(header, item.sourceVal, updated)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid #E5E7EB`, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {acceptedCount > 0
              ? `${acceptedCount} change${acceptedCount !== 1 ? 's' : ''} will be applied`
              : 'No changes selected yet'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ fontSize: 13, padding: '8px 18px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.textDark, cursor: 'pointer' }}
            >Cancel</button>
            <button
              onClick={handleApply}
              disabled={acceptedCount === 0}
              style={{
                fontSize: 13, padding: '8px 20px', borderRadius: 6, border: 'none',
                background: acceptedCount > 0 ? NAVY : '#E5E7EB',
                color: acceptedCount > 0 ? '#fff' : '#9CA3AF',
                cursor: acceptedCount > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              Apply {acceptedCount > 0 ? `${acceptedCount} Change${acceptedCount !== 1 ? 's' : ''}` : 'Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
