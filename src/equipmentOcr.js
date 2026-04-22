// Pure helpers for the Equipment Attachment OCR tool.
//
// Kept framework-free so the UI components stay thin and the FMX-side logic
// can be exercised without React.

import { fmxFetch, fmxAttachmentDownload, claudeFetch, parseClaudeText } from './apiClient';
import { fetchAllPages } from './fmxSync';
import { getActivePrompt, getEnabledExamplesForPrompt, createExtractionRun, completeExtractionRun } from './db';
import { buildSystemPrompt, extractUsage } from './promptTemplates';

// Claude vision-supported MIME types (bitmap images) and document types (PDF).
// Anything else is skipped per-attachment so a stray .docx/.dwg doesn't sink
// the run.
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DOCUMENT_MIMES = new Set(['application/pdf']);

export function classifyAttachment(mime) {
  if (!mime) return 'unsupported';
  const m = mime.toLowerCase();
  if (IMAGE_MIMES.has(m)) return 'image';
  if (DOCUMENT_MIMES.has(m)) return 'document';
  return 'unsupported';
}

// Paginate /v1/equipment. `fields` lets callers keep payloads small; we always
// include attachmentIDs + customFields because the tool depends on them.
export async function listEquipment(projectId, extraFields = []) {
  const baseFields = ['id', 'tag', 'attachmentIDs', 'buildingID', 'equipmentTypeID', 'customFields', ...extraFields];
  const fields = Array.from(new Set(baseFields)).join(',');
  const { items } = await fetchAllPages({ projectId }, '/v1/equipment', fields, 100);
  return items;
}

// Filter list helper: only equipment with at least one attachment.
export function withAttachments(equipmentList) {
  return (equipmentList || []).filter(e => Array.isArray(e.attachmentIDs) && e.attachmentIDs.length > 0);
}

// GET /v1/equipment/{id} — used by single mode to get the full record (incl.
// untouched customFields the PUT must round-trip).
export async function getEquipment(projectId, equipmentId) {
  const res = await fmxFetch({ projectId, endpoint: `/v1/equipment/${equipmentId}`, method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load equipment ${equipmentId}: ${res.status}`);
  return res.json();
}

// GET /v1/attachments/{id} — returns metadata w/ downloadUrl (no bytes).
export async function getAttachmentMeta(projectId, attachmentId) {
  const res = await fmxFetch({ projectId, endpoint: `/v1/attachments/${attachmentId}`, method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load attachment ${attachmentId}: ${res.status}`);
  return res.json();
}

// Resolve an attachment into { classification, base64, contentType, filename, meta }.
// Returns classification: 'image' | 'document' | 'unsupported'. When unsupported
// the bytes are not fetched (we skip the download to save bandwidth).
export async function fetchAttachmentForOcr(projectId, attachmentId) {
  const meta = await getAttachmentMeta(projectId, attachmentId);
  const classification = classifyAttachment(meta.contentType);
  if (classification === 'unsupported') {
    return { classification, meta };
  }
  if (!meta.downloadUrl) {
    return { classification: 'unsupported', meta, reason: 'No downloadUrl on attachment metadata' };
  }
  const { base64, contentType, filename, byteCount } = await fmxAttachmentDownload({
    projectId,
    downloadUrl: meta.downloadUrl,
  });
  return { classification, base64, contentType, filename, byteCount, meta };
}

// Run OCR on one equipment item.
// - `equipment`: the full equipment record (must include id, tag, attachmentIDs, customFields).
// - `fieldSelection`: [{ id, key, label, kind: 'system'|'custom', fieldType, raw }] from EquipmentOcrTab.
// - `projectId`, `userId`: used for run logging.
// Returns { parsed, runId, usage, attachments: [{ id, classification, skipped? }] } or throws.
export async function runOcrOnEquipment({ projectId, userId, equipment, fieldSelection }) {
  if (!equipment?.id) throw new Error('Missing equipment record');
  if (!Array.isArray(fieldSelection) || fieldSelection.length === 0) {
    throw new Error('No fields selected for extraction');
  }

  const prompt = await getActivePrompt('Equipment', 'ocr');
  if (!prompt) throw new Error('No active Equipment OCR prompt. Admin must seed one.');
  const examples = await getEnabledExamplesForPrompt(prompt.id);

  // Fetch attachment bytes in parallel, but skip unsupported MIME types.
  const rawAttachments = await Promise.all(
    (equipment.attachmentIDs || []).map(async (attId) => {
      try {
        return await fetchAttachmentForOcr(projectId, attId);
      } catch (e) {
        return { classification: 'unsupported', meta: { id: attId }, reason: e?.message || 'Download failed' };
      }
    })
  );

  const usable = rawAttachments.filter(a => a.classification !== 'unsupported' && a.base64);
  const skipped = rawAttachments
    .filter(a => a.classification === 'unsupported' || !a.base64)
    .map(a => ({ id: a.meta?.id, filename: a.meta?.filename, reason: a.reason || `unsupported (${a.meta?.contentType || 'unknown'})` }));

  const runStart = Date.now();
  const run = await createExtractionRun({
    projectId,
    userId,
    migrationType: 'Equipment',
    stage: 'ocr',
    sourceFilename: `equipment#${equipment.id}`,
    pageCount: usable.length,
    promptId: prompt.id,
    promptVersion: prompt.version,
  });

  try {
    if (usable.length === 0) {
      await completeExtractionRun(run?.id, {
        status: 'error',
        error: 'No supported attachments to OCR (all skipped).',
        durationMs: Date.now() - runStart,
      });
      return { parsed: { fields: {}, notes: 'No supported attachments.' }, runId: run?.id, usage: null, attachments: skipped.map(s => ({ ...s, skipped: true })) };
    }

    const system = buildSystemPrompt({
      body: prompt.body,
      vars: { MIGRATION_TYPE: 'Equipment' },
      examples,
    });

    const content = [
      {
        type: 'text',
        text: buildUserPromptText(equipment, fieldSelection),
      },
      ...usable.map(a => attachmentToClaudeBlock(a)),
    ];

    const response = await claudeFetch({
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content }],
    });

    const parsed = parseJsonResponse(response);
    const usage = extractUsage(response);

    await completeExtractionRun(run?.id, {
      status: parsed ? 'complete' : 'error',
      resultJson: parsed,
      error: parsed ? null : 'Failed to parse Claude JSON response',
      durationMs: Date.now() - runStart,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: usage.costUsd,
    });

    return {
      parsed: parsed || { fields: {}, notes: 'parse failure' },
      runId: run?.id,
      usage,
      attachments: [
        ...usable.map(a => ({ id: a.meta?.id, filename: a.meta?.filename, classification: a.classification })),
        ...skipped.map(s => ({ ...s, skipped: true })),
      ],
    };
  } catch (err) {
    await completeExtractionRun(run?.id, {
      status: 'error',
      error: err?.message || 'OCR failed',
      durationMs: Date.now() - runStart,
    });
    throw err;
  }
}

function buildUserPromptText(equipment, fieldSelection) {
  const lines = [];
  lines.push(`Equipment #${equipment.id}${equipment.tag ? ` — ${equipment.tag}` : ''}`);
  lines.push('');
  lines.push('Requested fields:');
  for (const f of fieldSelection) {
    const opts = describeFieldOptions(f);
    const type = f.kind === 'custom' ? (f.fieldType || 'Text') : 'system';
    lines.push(`- "${f.label}" (${type}${opts ? `; options: ${opts}` : ''})`);
  }
  lines.push('');
  lines.push('Attachments follow. Extract per the system instructions and return the JSON object.');
  return lines.join('\n');
}

function describeFieldOptions(field) {
  const raw = field.raw || {};
  if (Array.isArray(raw.options) && raw.options.length) {
    return raw.options.map(o => (typeof o === 'string' ? o : (o.label || o.value || ''))).filter(Boolean).join(' | ');
  }
  return null;
}

function attachmentToClaudeBlock(a) {
  if (a.classification === 'document') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: a.contentType || 'application/pdf', data: a.base64 },
    };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: a.contentType || 'image/jpeg', data: a.base64 },
  };
}

function parseJsonResponse(response) {
  const text = parseClaudeText(response);
  if (!text) return null;
  try {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    const jsonStr = first !== -1 && last > first ? text.slice(first, last + 1) : text;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// Merge proposed field values with the equipment record's existing
// customFields so a PUT never wipes a field the user didn't touch.
//
// `proposed` shape: { [fieldRowId]: { value, raw: { kind: 'system'|'custom', key } } }
// Returns a payload ready for PUT /v1/equipment/{id}.
export function buildEquipmentPutPayload(existing, proposed) {
  const payload = {};
  const existingCustom = Array.isArray(existing?.customFields) ? existing.customFields : [];
  // Start from existing customFields so untouched entries survive.
  const customByKey = new Map();
  for (const cf of existingCustom) {
    const k = cf.customFieldID ?? cf.customFieldId ?? cf.id;
    if (k != null) customByKey.set(String(k), { ...cf });
  }

  for (const row of proposed || []) {
    if (!row || row.accepted === false) continue;
    if (row.kind === 'custom') {
      customByKey.set(String(row.key), { customFieldID: row.key, value: row.value });
    } else if (row.kind === 'system') {
      payload[row.key] = row.value;
    }
  }

  payload.customFields = Array.from(customByKey.values());
  return payload;
}

// PUT /v1/equipment/{id} with an already-merged payload. Returns the parsed
// response or throws with a descriptive error.
export async function updateEquipment(projectId, equipmentId, payload) {
  const res = await fmxFetch({
    projectId,
    endpoint: `/v1/equipment/${equipmentId}`,
    method: 'PUT',
    payload,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch {}
    throw new Error(`FMX PUT failed (${res.status}): ${detail}`.slice(0, 400));
  }
  if (res.status === 204) return { status: 204 };
  try { return await res.json(); } catch { return { status: res.status }; }
}

// Build an "accepted rows" list from an OCR parsed result + the field catalog.
// Callers (UI) decide per row whether to accept and may override the value
// before handing the list to buildEquipmentPutPayload.
export function proposeAcceptedRows(parsed, fieldSelection) {
  const proposed = parsed?.fields || {};
  const rows = [];
  for (const f of fieldSelection) {
    const p = proposed[f.label] || proposed[f.key] || null;
    if (!p || p.value == null || p.value === '') continue;
    rows.push({
      rowId: f.id,
      key: f.key,
      kind: f.kind, // 'system' | 'custom'
      label: f.label,
      value: p.value,
      confidence: p.confidence || null,
      accepted: p.confidence === 'high', // default: only auto-accept high-confidence
    });
  }
  return rows;
}
