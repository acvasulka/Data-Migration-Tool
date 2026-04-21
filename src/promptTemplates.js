// Shared helpers for the admin-editable prompt system. Both the PDF extraction
// flow and the CSV field-mapping flow route through these so:
//   • Template placeholders are interpolated consistently.
//   • Curated few-shot examples are spliced onto every invocation.
//   • Claude's token usage is captured and converted to an approximate USD cost
//     so admins can watch per-run spend on the Extraction Runs tab.

// Roughly the Claude Sonnet 4 pricing at time of writing. Exact cents don't
// matter — this is a ballpark for the audit tab, not a billing source.
// Adjust here if/when pricing changes.
const PRICE_PER_MTOK = { input: 3.00, output: 15.00 }; // USD per 1M tokens

// Replaces {{TOKEN}} placeholders with values. Unknown tokens are left alone
// (no silent data loss — admins can see what didn't get filled in).
export function interpolateTemplate(body, vars) {
  if (!body) return '';
  return body.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (match, key) => {
    if (key in vars) {
      const v = vars[key];
      return typeof v === 'string' ? v : JSON.stringify(v);
    }
    return match;
  });
}

// Renders enabled few-shot examples as a trailing block on the system prompt.
// Intentionally simple: admins see exactly what gets appended and can audit.
export function formatExamplesBlock(examples) {
  if (!examples?.length) return '';
  const lines = ['', '---', 'Guidance from prior corrections (examples curated by an admin):'];
  for (const ex of examples) {
    const j = ex.example_json || {};
    if (j.hint) {
      lines.push(`- ${ex.label ? `[${ex.label}] ` : ''}${j.hint}`);
    } else if (j.input || j.output) {
      lines.push(`- ${ex.label || 'Example'}:`);
      if (j.input) lines.push(`    Input: ${j.input}`);
      if (j.output) lines.push(`    Output: ${JSON.stringify(j.output)}`);
    } else {
      lines.push(`- ${ex.label || 'Example'}: ${JSON.stringify(j)}`);
    }
  }
  lines.push('Apply these when they clearly match the situation. Otherwise follow the primary instructions above.');
  return lines.join('\n');
}

// Builds the final system prompt = stored body + interpolated vars + examples.
export function buildSystemPrompt({ body, vars, examples }) {
  const interpolated = interpolateTemplate(body, vars || {});
  return interpolated + formatExamplesBlock(examples);
}

// Extracts Claude's usage block (if present on the response) and converts to
// an approximate USD cost for the audit log.
export function extractUsage(claudeResponse) {
  const u = claudeResponse?.usage || {};
  const inputTokens = u.input_tokens ?? null;
  const outputTokens = u.output_tokens ?? null;
  let costUsd = null;
  if (inputTokens != null && outputTokens != null) {
    costUsd = (
      (inputTokens * PRICE_PER_MTOK.input +
       outputTokens * PRICE_PER_MTOK.output) / 1_000_000
    );
  }
  return { inputTokens, outputTokens, costUsd };
}

// Estimates the USD cost of re-running a past extraction_run with a draft
// prompt. We don't know the draft's real token count ahead of time, so we use
// the source run's token usage as the best available predictor and fall back
// to a coarse bound derived from page_count when tokens weren't captured.
export function estimateDryRunCost(sourceRun) {
  if (!sourceRun) return { inputTokens: null, outputTokens: null, costUsd: null, basis: 'unknown' };
  const inputTokens = sourceRun.input_tokens ?? null;
  const outputTokens = sourceRun.output_tokens ?? null;
  if (inputTokens != null && outputTokens != null) {
    const costUsd =
      (inputTokens * PRICE_PER_MTOK.input + outputTokens * PRICE_PER_MTOK.output) / 1_000_000;
    return { inputTokens, outputTokens, costUsd, basis: 'source-tokens' };
  }
  // Fallback rough estimate: ~2k input + ~1k output per PDF page, or ~3k input + ~500 output for mapping.
  const pages = sourceRun.page_count ?? 0;
  const isMapping = (sourceRun.stage || 'extraction') === 'field_mapping';
  const inEst = isMapping ? 3000 : Math.max(2000 * pages, 2000);
  const outEst = isMapping ? 500 : Math.max(1000 * pages, 1000);
  const costUsd = (inEst * PRICE_PER_MTOK.input + outEst * PRICE_PER_MTOK.output) / 1_000_000;
  return { inputTokens: inEst, outputTokens: outEst, costUsd, basis: 'heuristic' };
}

// Sums usage across multiple Claude responses (PDF extraction calls Claude
// once per page-batch, so we aggregate).
export function sumUsage(responses) {
  let inputTokens = 0, outputTokens = 0, anyTokens = false;
  for (const r of responses) {
    const u = extractUsage(r);
    if (u.inputTokens != null) { inputTokens += u.inputTokens; anyTokens = true; }
    if (u.outputTokens != null) { outputTokens += u.outputTokens; anyTokens = true; }
  }
  if (!anyTokens) return { inputTokens: null, outputTokens: null, costUsd: null };
  const costUsd = (
    (inputTokens * PRICE_PER_MTOK.input +
     outputTokens * PRICE_PER_MTOK.output) / 1_000_000
  );
  return { inputTokens, outputTokens, costUsd };
}
