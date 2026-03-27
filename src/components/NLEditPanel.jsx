import { useState } from "react";
import { C } from "../theme";

export default function NLEditPanel({
  headers,
  onApply,
  updateScope,        // 'all' | 'filtered'
  onToggleScope,      // () => void
  filteredCount,      // number
  totalCount,         // number
  suggestions,        // null | Array<{ text, affectedCount }>
  suggestionsLoading, // bool
  canUndo,            // bool
  onUndo,             // () => void
}) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const hasFilter = typeof filteredCount === 'number' && filteredCount !== totalCount;

  const apply = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 400,
          messages: [{ role: "user", content: `You are a data transformation assistant. The user wants to update rows in a table. Available FMX fields: ${JSON.stringify(headers)}. Instruction: "${instruction}". Return ONLY a JSON object with two keys: "field" (the FMX field name to update) and "code" (a JS function body that receives a "row" object and returns the new value for that field, or null to skip the row). No markdown, no explanation.` }]
        })
      });
      const data = await res.json();
      const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const { field, code } = JSON.parse(clean);
      if (field && code) onApply(field, code);
      setInstruction("");
    } catch { setErr("Failed to parse instruction — try rephrasing."); }
    setLoading(false);
  };

  const applySuggestion = (text) => {
    setInstruction(text);
    setTimeout(() => {
      setLoading(true); setErr("");
      fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 400,
          messages: [{ role: "user", content: `You are a data transformation assistant. The user wants to update rows in a table. Available FMX fields: ${JSON.stringify(headers)}. Instruction: "${text}". Return ONLY a JSON object with two keys: "field" (the FMX field name to update) and "code" (a JS function body that receives a "row" object and returns the new value for that field, or null to skip the row). No markdown, no explanation.` }]
        })
      })
        .then(r => r.json())
        .then(data => {
          const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
          const { field, code } = JSON.parse(clean);
          if (field && code) onApply(field, code);
          setInstruction("");
        })
        .catch(() => setErr("Failed to apply suggestion — try manually."))
        .finally(() => setLoading(false));
    }, 10);
  };

  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '1fr 1px 1fr',
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>

      {/* ── Left column: label + hint + input ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Bulk Edit
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.textMid, lineHeight: 1.4 }}>
          e.g. "Fill blank 'Type' fields with HVAC" or "Set Building to 'Main Campus' where it's empty"
        </p>

        {/* Input pushed to bottom */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            className="fmx-input"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => e.key === "Enter" && apply()}
            placeholder="Describe what to change…"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          {err && <p style={{ fontSize: 12, color: C.errText, margin: 0 }}>{err}</p>}
        </div>
      </div>

      {/* ── Vertical divider ── */}
      <div style={{ background: C.border }} />

      {/* ── Right column: suggestions top, controls bottom ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px' }}>

        {/* Suggestions */}
        {suggestionsLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textLight }}>
            <div style={{ width: 10, height: 10, border: `2px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', animation: '_sv_spin 0.8s linear infinite', flexShrink: 0 }} />
            Generating suggestions…
          </div>
        )}
        {suggestions && suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Suggestions
            </p>
            {suggestions.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '6px 8px', marginBottom: 4, borderRadius: 6,
                background: C.blueBg, border: `1px solid ${C.blueBorder}`,
              }}>
                <span style={{ fontSize: 11, color: C.textDark, flex: 1, lineHeight: 1.5 }}>
                  {s.text}
                  {s.affectedCount > 0 && (
                    <span style={{ color: C.textLight, marginLeft: 5 }}>— {s.affectedCount} rows</span>
                  )}
                </span>
                <button
                  className="fmx-btn-xs"
                  style={{ flexShrink: 0, fontSize: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}
                  onClick={() => applySuggestion(s.text)}
                  disabled={loading}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}
        {suggestions && suggestions.length === 0 && !suggestionsLoading && (
          <p style={{ margin: 0, fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>No suggestions — data looks good!</p>
        )}

        {/* Controls: Apply + Undo + scope (pushed to bottom) */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="fmx-btn-primary"
              style={{ fontSize: 13, padding: "6px 16px", whiteSpace: "nowrap" }}
              onClick={apply}
              disabled={loading}
            >
              {loading ? "Applying…" : "Apply"}
            </button>
            {onUndo && (
              <button
                className="fmx-btn-xs"
                onClick={onUndo}
                disabled={!canUndo}
                title={canUndo ? "Undo last bulk edit" : "Nothing to undo"}
                style={{ whiteSpace: 'nowrap', opacity: canUndo ? 1 : 0.4 }}
              >
                ↩ Undo
              </button>
            )}
          </div>

          {onToggleScope && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: C.textMid, whiteSpace: 'nowrap' }}>Apply to:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`fmx-btn-xs-rule${updateScope === 'all' ? ' active' : ''}`}
                  onClick={() => updateScope !== 'all' && onToggleScope()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  All rows{typeof totalCount === 'number' ? ` (${totalCount})` : ''}
                </button>
                <button
                  className={`fmx-btn-xs-rule${updateScope === 'filtered' ? ' active' : ''}`}
                  onClick={() => updateScope !== 'filtered' && onToggleScope()}
                  disabled={!hasFilter}
                  title={!hasFilter ? 'No active filters — same as all rows' : `Apply only to the ${filteredCount} visible rows`}
                  style={{ whiteSpace: 'nowrap', opacity: !hasFilter ? 0.5 : 1 }}
                >
                  Filtered{typeof filteredCount === 'number' ? ` (${filteredCount})` : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
