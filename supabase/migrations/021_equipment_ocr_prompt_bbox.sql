-- Migration 021: Equipment OCR prompt v2 — numeric confidence + per-field bbox.
--
-- Changes vs. v1 (migration 019):
--   • `confidence` becomes an integer 0-100 instead of the enum "high"|"medium"|"low".
--     Rendered as a percentage in the review UI.
--   • New `bbox` per field: normalized [x0, y0, x1, y1] in 0-1 relative to the
--     source attachment's pixel dimensions (top-left origin). The UI uses this
--     to draw a red rectangle on the attachment preview showing where the
--     value was read from. Omitted only when value is null or the source is a
--     PDF.
--
-- Additive + idempotent:
--   • If v2 doesn't exist yet, deactivate the current active stage-level
--     (field_key IS NULL) prompt and insert v2. Per-field (field_key NOT NULL)
--     prompts are left untouched.
--   • If v2 already exists, refresh its body so re-running this migration
--     always lands the latest prompt without needing a v3.

do $$
declare
  prompt_body text;
begin
  prompt_body := $prompt$You are reading an equipment nameplate / spec sheet / photo that is attached to an FMX Equipment record, and extracting specific fields for that record.

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

EXAMPLE of a populated field entry (image source):
"Model number": { "value": "RTU-50-H", "confidence": 92, "source_attachment_id": 42, "source_text": "RTU-50-H", "bbox": [0.31, 0.62, 0.48, 0.67] }

RULES
1. BBOX IS REQUIRED. Every fields[*] entry whose `value` is non-null AND whose `source_attachment_id` points to an image MUST include a `bbox` key. Omit `bbox` ONLY when `value` is null, OR when the source is a PDF. If you cannot pin down a tight region for a value you are extracting, return a looser region — an approximate bbox is strictly better than omitting the key.
2. `bbox` is normalized to 0-1 on the source attachment's pixel dimensions, top-left origin, order [x0, y0, x1, y1]. Do NOT return pixel coordinates. Values must satisfy 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1.
3. `confidence` is an integer 0-100 reflecting how sure you are the extracted value is correct.
4. Only return fields that were requested. Never invent extra fields.
5. For Dropdown fields, the value MUST match one of the provided option labels exactly; if none match confidently, return null.
6. Dates: return ISO 8601 (YYYY-MM-DD) when possible.
7. Numbers: return a bare number (no units, no commas).
8. Prefer null over guessing. Low confidence is fine; fabrication is not.
9. Return ONLY the JSON. No prose, no code fences.$prompt$;

  if exists (select 1 from prompts where migration_type = 'Equipment' and stage = 'ocr' and version = 2 and field_key is null) then
    -- Deactivate any other stage-level version first, to avoid colliding with
    -- the "one active per (migration_type, stage, field_key)" partial unique
    -- index when we flip v2 active below.
    update prompts
       set active = false
     where migration_type = 'Equipment'
       and stage = 'ocr'
       and field_key is null
       and version <> 2
       and active = true;

    -- Refresh body so iterating on the prompt doesn't require a v3.
    update prompts
       set body = prompt_body,
           active = true,
           notes = 'v2 — numeric confidence + per-field bbox for source highlighting'
     where migration_type = 'Equipment'
       and stage = 'ocr'
       and version = 2
       and field_key is null;
  else
    -- Deactivate the prior stage-level active prompt ONLY (field_key is null).
    -- Per-field (field_key is not null) prompts are left alone.
    update prompts
       set active = false
     where migration_type = 'Equipment'
       and stage = 'ocr'
       and field_key is null
       and active = true;

    insert into prompts (migration_type, stage, field_key, version, body, active, notes)
    values ('Equipment', 'ocr', null, 2, prompt_body, true,
            'v2 — numeric confidence + per-field bbox for source highlighting');
  end if;
end $$;
