-- Migration 021: Equipment OCR prompt v2 — numeric confidence + per-field bbox.
--
-- Changes vs. v1 (migration 019):
--   • `confidence` becomes an integer 0-100 instead of the enum "high"|"medium"|"low".
--     Rendered as a percentage in the review UI.
--   • New optional `bbox` per field: normalized [x0, y0, x1, y1] in 0-1 relative to
--     the source attachment's pixel dimensions (top-left origin). The UI uses this
--     to draw a red rectangle on the attachment preview showing where the value
--     was read from. Omitted when value is null or the source is a PDF.
--
-- Additive + idempotent: only inserts when no v2 row exists. Deactivates the prior
-- active Equipment/ocr prompt so the new version is the one consumers pick up
-- via getActivePrompt().

do $$
declare
  body text;
begin
  body := $prompt$You are reading an equipment nameplate / spec sheet / photo that is attached to an FMX Equipment record, and extracting specific fields for that record.

INPUTS
- The equipment's tag and type (for context).
- A list of target fields the user wants populated. Each has a name, a type (Text / Number / Date / Dropdown / etc.), and — when it's a dropdown — the allowed option labels.
- One or more attachments (images or PDFs) associated with the equipment.

TASK
For each requested field, determine the most likely value from the attachments. Prefer values from clearly legible, authoritative text (nameplates, labeled spec tables). When the attachments disagree or a value is unreadable, return null for that field and explain in notes.

OUTPUT
Return ONLY a JSON object with this exact shape:
{
  "fields": {
    "<field name>": {
      "value": <string | number | null>,
      "confidence": <integer 0-100>,
      "source_attachment_id": <attachment id or null>,
      "source_text": "<short verbatim quote from the attachment, if applicable>",
      "bbox": [x0, y0, x1, y1]
    },
    ...
  },
  "notes": "<optional free-form observations>"
}

RULES
1. Only return fields that were requested. Never invent extra fields.
2. For Dropdown fields, the value MUST match one of the provided option labels exactly; if none match confidently, return null.
3. Dates: return ISO 8601 (YYYY-MM-DD) when possible.
4. Numbers: return a bare number (no units, no commas).
5. Prefer null over guessing. Low confidence (small integer) is fine; fabrication is not.
6. `confidence` is an integer 0-100 reflecting how sure you are the extracted value is correct.
7. `bbox` is normalized to 0-1 on the source attachment's pixel dimensions, top-left origin, order [x0,y0,x1,y1]. Omit the `bbox` key entirely when value is null or when the source is a PDF.
8. Return ONLY the JSON. No prose, no code fences.$prompt$;

  if not exists (select 1 from prompts where migration_type = 'Equipment' and stage = 'ocr' and version = 2) then
    update prompts set active = false where migration_type = 'Equipment' and stage = 'ocr' and active = true;
    insert into prompts (migration_type, stage, version, body, active, notes)
    values ('Equipment', 'ocr', 2, body, true, 'v2 — numeric confidence + per-field bbox for source highlighting');
  end if;
end $$;
