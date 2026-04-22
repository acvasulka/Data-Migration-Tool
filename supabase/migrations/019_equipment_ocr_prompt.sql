-- Migration 019: Seed the system prompt used by the Equipment Attachment OCR tool.
--
-- The OCR tool fetches attachments linked to FMX Equipment records, runs
-- Claude vision over them, and proposes values for a set of fields the user
-- picks at run time. Routing through the prompts table means admins can
-- tweak wording and curate few-shot examples without a redeploy — the same
-- pattern the PDF extraction and CSV mapping flows follow.
--
-- (migration_type, stage) = ('Equipment', 'ocr'). Additive & idempotent.

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
      "confidence": "high" | "medium" | "low",
      "source_attachment_id": <attachment id or null>,
      "source_text": "<short verbatim quote from the attachment, if applicable>"
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
5. Prefer null over guessing. Low confidence is fine; fabrication is not.
6. Return ONLY the JSON. No prose, no code fences.$prompt$;

  if not exists (select 1 from prompts where migration_type = 'Equipment' and stage = 'ocr') then
    insert into prompts (migration_type, stage, version, body, active, notes)
    values ('Equipment', 'ocr', 1, body, true, 'Seeded default — Equipment Attachment OCR tool');
  end if;
end $$;
