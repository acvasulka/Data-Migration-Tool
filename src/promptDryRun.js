// Admin dry-run runners for the Prompts editor.
//
// Each runner re-executes a past extraction_run against a *draft* prompt body
// plus an admin-chosen subset of examples (the `enabled` flag in the DB is
// ignored — the editor passes a draft-local list so admins can toggle without
// writing). A new extraction_runs row is logged with `dry_run=true` and
// `dry_run_source_run_id` back-linking the original run so the UI can diff
// outputs and filter spend.

import {
  createExtractionRun,
  completeExtractionRun,
  downloadPdfFromStorage,
} from './db';
import { claudeFetch, parseClaudeText, CLAUDE_MODEL } from './apiClient';
import { buildSystemPrompt, extractUsage, sumUsage } from './promptTemplates';
import {
  PAGE_BATCH_SIZE,
  renderPdfPagesToImages,
  extractBatch,
  mergeBatchResults,
} from './pdfExtract';

// Run the PDF extraction pipeline with a draft prompt + draft examples against
// the PDF stored with `sourceRun`. Returns the new dry-run row plus parsed
// {headers, rows}, or throws on failure. onProgress mirrors extractPdfToSheet.
export async function runExtractionDryRun({
  sourceRun,
  draftBody,
  draftExamples,
  migrationType,
  projectId,
  userId,
  onProgress,
}) {
  if (!sourceRun?.storage_key) {
    throw new Error('Source run has no stored PDF — cannot dry-run.');
  }
  const start = Date.now();

  const systemPrompt = buildSystemPrompt({
    body: draftBody,
    vars: { MIGRATION_TYPE: migrationType },
    examples: draftExamples || [],
  });

  onProgress?.('Downloading source PDF…');
  const file = await downloadPdfFromStorage(sourceRun.storage_key, sourceRun.source_filename || 'run.pdf');
  if (!file) throw new Error('Failed to download source PDF from storage.');

  onProgress?.('Rendering pages…');
  const images = await renderPdfPagesToImages(file, (cur, total) =>
    onProgress?.('Rendering pages…', { current: cur, total })
  );

  const run = await createExtractionRun({
    projectId,
    userId,
    migrationType,
    stage: 'extraction',
    storageKey: sourceRun.storage_key,
    sourceFilename: sourceRun.source_filename,
    pageCount: images.length,
    promptId: null, // draft isn't saved
    promptVersion: null,
    dryRun: true,
    dryRunSourceRunId: sourceRun.id,
  });

  try {
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

    const { headers, rows } = mergeBatchResults(results);
    const usage = sumUsage(responses);

    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'complete',
        resultJson: { headers, rowCount: rows.length, model: CLAUDE_MODEL, rows: rows.slice(0, 200) },
        durationMs: Date.now() - start,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: usage.costUsd,
      });
    }

    return { runId: run?.id || null, headers, rows, usage, durationMs: Date.now() - start };
  } catch (err) {
    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'error',
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      });
    }
    throw err;
  }
}

// Re-invokes the CSV field_mapping Claude call with a draft prompt + draft
// examples. Uses the headers/fields snapshotted on the source run's
// result_json. Returns the new mapping object and the dry-run row id.
export async function runMappingDryRun({
  sourceRun,
  draftBody,
  draftExamples,
  migrationType,
  projectId,
  userId,
}) {
  const snap = sourceRun?.result_json || {};
  const csvHeaders = snap.csvHeaders;
  const fmxFieldNames = snap.fmxFieldNames;
  const suggested = snap.suggested || {};
  if (!Array.isArray(csvHeaders) || !Array.isArray(fmxFieldNames)) {
    throw new Error('Source run is missing snapshot of CSV headers / FMX fields. Only runs logged after migration 14 can be replayed.');
  }
  const start = Date.now();

  const systemPrompt = buildSystemPrompt({
    body: draftBody,
    vars: {
      MIGRATION_TYPE: migrationType,
      CSV_HEADERS: csvHeaders,
      FMX_FIELDS: fmxFieldNames,
      SUGGESTED: suggested,
    },
    examples: draftExamples || [],
  });

  const run = await createExtractionRun({
    projectId,
    userId,
    migrationType,
    stage: 'field_mapping',
    sourceFilename: sourceRun.source_filename,
    pageCount: null,
    promptId: null,
    promptVersion: null,
    dryRun: true,
    dryRunSourceRunId: sourceRun.id,
  });

  try {
    const aiRes = await claudeFetch({
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `CSV headers: ${JSON.stringify(csvHeaders)}\nFMX fields: ${JSON.stringify(fmxFieldNames)}\nHeuristic pre-matches: ${JSON.stringify(suggested)}\n\nReturn ONLY the JSON mapping object.`,
      }],
    });

    let mapping = {};
    const text = parseClaudeText(aiRes) || '{}';
    try { mapping = JSON.parse(text); } catch { /* leave empty */ }
    const usage = extractUsage(aiRes);

    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'complete',
        resultJson: {
          mapping,
          fmxFieldCount: fmxFieldNames.length,
          csvHeaderCount: csvHeaders.length,
          csvHeaders,
          fmxFieldNames,
          suggested,
        },
        durationMs: Date.now() - start,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: usage.costUsd,
      });
    }
    return { runId: run?.id || null, mapping, usage, durationMs: Date.now() - start };
  } catch (err) {
    if (run?.id) {
      await completeExtractionRun(run.id, {
        status: 'error',
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      });
    }
    throw err;
  }
}
