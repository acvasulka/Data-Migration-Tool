import { useState } from "react";
import { C } from "../theme";

export default function NLEditPanel({
  headers,
  onApply,
  updateScope,      // 'all' | 'filtered'
  onToggleScope,    // () => void
  filteredCount,    // number
  totalCount,       // number
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

  return (
    <div style={{ padding: "14px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ margin: "0 0 1px", fontSize: 11, fontWeight: 600, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bulk Edit</p>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: C.textMid }}>e.g. "Fill blank 'Type' fields with HVAC" or "Set Building to 'Main Campus' where it's empty"</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="fmx-input"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === "Enter" && apply()}
          placeholder="Describe what to change…"
          style={{ flex: 1 }}
        />
        <button className="fmx-btn-primary" style={{ fontSize: 13, padding: "6px 16px", whiteSpace: "nowrap" }} onClick={apply} disabled={loading}>
          {loading ? "Applying…" : "Apply"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: C.errText, margin: 0 }}>{err}</p>}

      {/* Apply scope toggle */}
      {onToggleScope && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
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
              Filtered rows{typeof filteredCount === 'number' ? ` (${filteredCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
