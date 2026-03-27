import { useState } from "react";
import { C } from "../theme";
import { claudeFetch, parseClaudeText } from "../apiClient";

export default function NLEditPanel({ headers, onApply }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const apply = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setErr("");
    try {
      const data = await claudeFetch({
        max_tokens: 400,
        messages: [{ role: "user", content: `You are a data transformation assistant. The user wants to update rows in a table. Available FMX fields: ${JSON.stringify(headers)}. Instruction: "${instruction}". Return ONLY a JSON object with two keys: "field" (the FMX field name to update) and "code" (a JS function body that receives a "row" object and returns the new value for that field, or null to skip the row). No markdown, no explanation.` }]
      });
      const clean = parseClaudeText(data) || "{}";
      const { field, code } = JSON.parse(clean);
      if (field && code) onApply(field, code);
      setInstruction("");
    } catch { setErr("Failed to parse instruction — try rephrasing."); }
    setLoading(false);
  };

  return (
    <div style={{ padding: "12px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.navy }}>Bulk edit in plain language</p>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: C.textMid }}>e.g. "Fill blank 'Type' fields with HVAC" or "Set Building to 'Main Campus' where it's empty"</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="fmx-input"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === "Enter" && apply()}
          placeholder="Describe what to change..."
          style={{ flex: 1 }}
        />
        <button className="fmx-btn-primary" style={{ fontSize: 13, padding: "6px 16px", whiteSpace: "nowrap" }} onClick={apply} disabled={loading}>
          {loading ? "Applying..." : "Apply"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: C.errText, marginTop: 6 }}>{err}</p>}
    </div>
  );
}
