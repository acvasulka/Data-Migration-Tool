// PDF → {headers, rows} extraction pipeline.
//
// Flow (all client-side except the Claude API proxy):
//   1. Upload the raw PDF to Supabase Storage (`pdf-uploads` bucket) so a copy
//      exists for audit / retry, bypassing the Vercel 4.5 MB serverless body
//      limit.
//   2. Use pdfjs-dist to render each page to a PNG data URL in the browser.
//   3. Chunk pages into batches of PAGE_BATCH_SIZE and send each batch to
//      Claude vision via the existing /api/claude proxy, using the admin-
//      editable prompt stored in the `prompts` table for this migration type.
//   4. Merge batch results → union of field labels as headers, concatenated rows.
//   5. Record an `extraction_runs` row for audit.
//
// The final { headers, rows } plugs directly into the existing mapping /
// validation / transform flow — PDF becomes just another upload source.

import { supabase } from './supabase';
import { claudeFetch, parseClaudeText, CLAUDE_MODEL } from './apiClient';
import {
  getActivePrompt,
  createExtractionRun,
  completeExtractionRun,
  getEnabledExamplesForPrompt,
  incrementExampleUsage,
} from './db';
import { buildSystemPrompt, sumUsage } from './promptTemplates';

export const PAGE_BATCH_SIZE = 3;       // pages per Claude call — balances cost vs. latency
const RENDER_SCALE = 2.0;        // 2x DPI — readable for OCR without exploding payload size
const MAX_IMAGE_BYTES = 3_500_000; // ~3.5 MB base64 per image — Claude's per-image limit is 5 MB

let _pdfjsPromise = null;
async function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf');
      // Worker: use the CDN copy that matches the installed version so we don't
      // need webpack worker-loader config in CRA.
      const version = pdfjs.version;
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

// Upload the raw PDF to Supabase Storage. Returns the storage key (path) or null.
async function uploadPdfToStorage(file, userId) {
  try {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const key = `${userId || 'anon'}/${ts}_${safeName}`;
    const { error } = await supabase.storage
      .from('pdf-uploads')
      .upload(key, file, { contentType: 'application/pdf', upsert: false });
    if (error) {
      console.warn('PDF storage upload failed (non-fatal):', error.message);
      return null;
    }
    return key;
  } catch (e) {
    console.warn('PDF storage upload exception (non-fatal):', e);
    return null;
  }
}

// Render all pages of a PDF to PNG data URLs. onProgress receives (pageIdx, total).
export async function renderPdfPagesToImages(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const images = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    let scale = RENDER_SCALE;
    let dataUrl;
    // Downscale if a page turns out too large to fit Claude's per-image cap.
    for (let attempt = 0; attempt < 3; attempt++) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      dataUrl = canvas.toDataURL('image/png');
      // Rough base64-byte estimate: (length * 3) / 4
      const approxBytes = (dataUrl.length * 3) / 4;
      if (approxBytes <= MAX_IMAGE_BYTES) break;
      scale *= 0.7;
    }
    images.push(dataUrl);
    onProgress?.(p, doc.numPages);
  }
  return images;
}

function dataUrlToBase64(dataUrl) {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

// Extract structured data from one batch of page images via Claude vision.
// Returns { parsed, response } — parsed is { fields, rows, notes } or null,
// response is the raw Claude response (used to aggregate token usage).
export async function extractBatch(promptBody, imageDataUrls, batchIdx, totalBatches) {
  const content = [
    {
      type: 'text',
      text:
        `Batch ${batchIdx + 1} of ${totalBatches}. ` +
        `The following images are consecutive pages from a single PDF. ` +
        `Extract the structured data per the instructions. Return ONLY the JSON object described.`,
    },
    ...imageDataUrls.map(url => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: dataUrlToBase64(url) },
    })),
  ];

  const res = await claudeFetch({
    max_tokens: 4000,
    system: promptBody,
    messages: [{ role: 'user', content }],
  });

  const text = parseClaudeText(res);
  if (!text) return { parsed: null, response: res };
  try {
    // Claude sometimes wraps JSON in stray prose despite instructions.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    const jsonStr = first !== -1 && last > first ? text.slice(first, last + 1) : text;
    const parsed = JSON.parse(jsonStr);
    return {
      parsed: {
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
        notes: parsed.notes || null,
      },
      response: res,
    };
  } catch (e) {
    console.warn('Failed to parse Claude batch JSON:', e, text.slice(0, 500));
    return { parsed: null, response: res };
  }
}

// Merge per-batch results into a single { headers, rows } table.
// Header order is stable: first-seen order across batches; each row is a
// plain object keyed by label, matching what parseCSV() produces so the
// existing mapping pipeline works unchanged.
export function mergeBatchResults(batchResults) {
  const headerOrder = [];
  const seen = new Set();
  const allRows = [];
  for (const b of batchResults) {
    if (!b) continue;
    for (const f of b.fields) {
      if (!seen.has(f)) { seen.add(f); headerOrder.push(f); }
    }
    for (const r of b.rows) {
      // Also capture any row-only keys that didn't appear in `fields`
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) { seen.add(k); headerOrder.push(k); }
      }
      allRows.push(r);
    }
  }
  // Normalize rows so every row has every header key (stringified, empty default).
  const rows = allRows.map(r => {
    const out = {};
    for (const h of headerOrder) {
      const v = r[h];
      out[h] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
  return { headers: headerOrder, rows };
}

/**
 * Main entry. Extracts {headers, rows} from a PDF file using Claude vision.
 *
 * @param {File} file                     — the user-selected PDF
 * @param {string} migrationType          — e.g. 'Building', 'Equipment'
 * @param {object} opts
 * @param {string} [opts.projectId]       — current project id (for audit log)
 * @param {string} [opts.userId]          — current user id (for audit log)
 * @param {(stage:string, progress?:{current:number,total:number}) => void} [opts.onProgress]
 * @returns {Promise<{ headers: string[], rows: object[], runId: string|null, pageCount: number }>}
 */
export async function extractPdfToSheet(file, migrationType, opts = {}) {
  const { projectId, userId, onProgress } = opts;
  const startTs = Date.now();

  onProgress?.('Loading extraction prompt…');
  // Prompts are keyed by the base migration type (strip module suffix like ":maintenance").
  const baseType = migrationType.includes(':') ? migrationType.split(':')[0] : migrationType;
  const prompt = await getActivePrompt(baseType, 'extraction');
  if (!prompt?.body) {
    throw new Error(
      `No active extraction prompt found for "${baseType}". Ask an admin to configure one in Admin Settings → Prompts.`
    );
  }

  // Load admin-curated few-shot examples for this prompt and splice them into
  // the system prompt. Only enabled examples are returned.
  const examples = await getEnabledExamplesForPrompt(prompt.id);
  const systemPrompt = buildSystemPrompt({
    body: prompt.body,
    vars: { MIGRATION_TYPE: baseType },
    examples,
  });

  onProgress?.('Uploading PDF…');
  const storageKey = await uploadPdfToStorage(file, userId);

  onProgress?.('Rendering pages…');
  const images = await renderPdfPagesToImages(file, (cur, total) => {
    onProgress?.('Rendering pages…', { current: cur, total });
  });

  // Create audit row before calling Claude so we capture failures too.
  const run = await createExtractionRun({
    projectId,
    userId,
    migrationType: baseType,
    storageKey,
    sourceFilename: file.name,
    pageCount: images.length,
    promptId: prompt.id,
    promptVersion: prompt.version,
  });

  try {
    // Build batches
    const batches = [];
    for (let i = 0; i < images.length; i += PAGE_BATCH_SIZE) {
      batches.push(images.slice(i, i + PAGE_BATCH_SIZE));
    }

    const results = [];
    const responses = [];
    for (let bi = 0; bi < batches.length; bi++) {
      onProgress?.(`Extracting batch ${bi + 1} of ${batches.length}…`, {
        current: bi + 1, total: batches.length,
      });
      const { parsed, response } = await extractBatch(systemPrompt, batches[bi], bi, batches.length);
      results.push(parsed);
      responses.push(response);
    }

    // Bump usage counters for the injected examples (fire-and-forget).
    if (examples?.length) incrementExampleUsage(examples.map(e => e.id));

    const { headers, rows } = mergeBatchResults(results);
    const usage = sumUsage(responses);

    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'complete',
        resultJson: { headers, rowCount: rows.length, model: CLAUDE_MODEL },
        durationMs: Date.now() - startTs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: usage.costUsd,
      });
    }

    return { headers, rows, runId: run?.id || null, pageCount: images.length };
  } catch (err) {
    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'error',
        error: err?.message || String(err),
        durationMs: Date.now() - startTs,
      });
    }
    throw err;
  }
}
