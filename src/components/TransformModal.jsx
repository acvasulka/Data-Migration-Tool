import { useState } from "react";
import { C } from "../theme";
import Modal from "./Modal";
import { claudeFetch, parseClaudeText } from "../apiClient";

export default function TransformModal({ fieldName, csvHeaders, currentRule, savedRule, onSave, onClose }) {
  const [instruction, setInstruction] = useState(currentRule?.instruction || savedRule?.instruction || "");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(currentRule?.code || savedRule?.code || "");
  const [err, setErr] = useState("");

  const generate = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setErr("");
    try {
      const data = await claudeFetch({
        max_tokens: 500,
        messages: [{ role: "user", content: `You are a JavaScript code generator for a data migration tool. Write a function body (no declaration) that receives a "row" object (keys = CSV column names) and returns the computed string value for FMX field "${fieldName}". Available columns: ${JSON.stringify(csvHeaders)}. Instruction: "${instruction}". Return ONLY raw JS, no markdown, no explanation.` }]
      });
      setCode(parseClaudeText(data));
    } catch (e) { setErr(e.status ? e.message : "Generation failed — check connection."); }
    setLoading(false);
  };

  return (
    <Modal width={440} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.navy }}>Transform rule — "{fieldName}"</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.textMid, lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      {savedRule && (
        <p style={{ fontSize: 12, color: '#0F6E56', background: '#E1F5EE', border: '1px solid #5DCAA5', borderRadius: 6, padding: '6px 10px', margin: '0 0 10px' }}>
          Saved rule from previous import — review and apply
        </p>
      )}
      <p style={{ fontSize: 12, color: C.textMid, margin: "0 0 8px" }}>Describe what this field should contain in plain language:</p>
      <textarea
        className="fmx-textarea"
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder={`e.g. "Combine 'description' and 'type' with a dash. If only one exists, use that."`}
        style={{ minHeight: 72 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="fmx-btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={generate} disabled={loading}>
          {loading ? "Generating..." : "Generate rule"}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: C.errText, marginTop: 6 }}>{err}</p>}
      {code && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Generated rule (editable)</p>
          <textarea
            className="fmx-textarea"
            value={code}
            onChange={e => setCode(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 11, minHeight: 100 }}
          />
          <button className="fmx-btn-primary" style={{ marginTop: 8, fontSize: 12, padding: "6px 18px" }} onClick={() => onSave({ instruction, code })}>
            Apply rule
          </button>
        </div>
      )}
    </Modal>
  );
}
