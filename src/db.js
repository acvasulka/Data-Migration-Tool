import { supabase } from './supabase';
import { IMPORT_ORDER } from './schemas';
import { saveFmxCredentialsRequest, clearFmxCredentialsRequest } from './apiClient';

async function dbQuery(queryFn, fallback) {
  try {
    const { data, error } = await queryFn();
    if (error) return fallback;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

async function dbMutate(mutationFn) {
  try {
    const { error } = await mutationFn();
    return !error;
  } catch {
    return false;
  }
}

// --- PROJECTS ---

export async function getProjects() {
  return dbQuery(
    () => supabase.from('projects').select('*').order('updated_at', { ascending: false }),
    []
  );
}

// Credentials are NOT written here. Callers create the project row first, then
// save credentials through saveProjectCredentials so they get encrypted server-side.
export async function createProject(name, description, fmxSiteUrl, userId = null) {
  return dbQuery(
    () => supabase.from('projects').insert({
      name,
      description: description || null,
      fmx_site_url: fmxSiteUrl || null,
      user_id: userId || null,
    }).select().single(),
    null
  );
}

export async function getProjectsByOwner(userId) {
  return dbQuery(
    () => supabase.from('projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    []
  );
}

export async function getOtherProjects(userId) {
  return dbQuery(
    () => supabase.from('projects').select('*').or(`user_id.neq.${userId},user_id.is.null`).order('updated_at', { ascending: false }),
    []
  );
}

export async function updateProjectOwner(projectId, newOwnerId) {
  return dbQuery(
    () => supabase.from('projects').update({ user_id: newOwnerId }).eq('id', projectId).select().single(),
    null
  );
}

export async function getProjectByFmxUrl(fmxSiteUrl) {
  return dbQuery(
    () => supabase.from('projects').select('id, name, user_id, fmx_site_url').eq('fmx_site_url', fmxSiteUrl).limit(1).maybeSingle(),
    null
  );
}

// --- PROFILES ---

export async function getAllProfiles() {
  return dbQuery(
    () => supabase.from('profiles').select('id, full_name, email, role'),
    []
  );
}

export async function getCurrentProfile(userId) {
  return dbQuery(
    () => supabase.from('profiles').select('id, full_name, email, role').eq('id', userId).single(),
    null
  );
}

export async function getImportSummaryForProjects(projectIds) {
  if (!projectIds || projectIds.length === 0) return [];
  return dbQuery(
    () => supabase.from('project_imports').select('project_id, schema_type').in('project_id', projectIds),
    []
  );
}

export async function updateProfileRole(userId, newRole) {
  return dbQuery(
    () => supabase.from('profiles').update({ role: newRole }).eq('id', userId).select().single(),
    null
  );
}

export async function updateProfileName(userId, fullName) {
  return dbQuery(
    () => supabase.from('profiles').update({ full_name: fullName }).eq('id', userId).select().single(),
    null
  );
}

// Claim an unassigned project. The .is('user_id', null) guard prevents racing claims.
export async function claimProject(projectId, userId) {
  return dbQuery(
    () => supabase.from('projects').update({ user_id: userId }).eq('id', projectId).is('user_id', null).select().single(),
    null
  );
}

// Invoke the delete-user Edge Function. Returns { success: true } or { error: '...' }.
export async function deleteUserViaEdgeFunction(userId) {
  try {
    const { data, error } = await supabase.functions.invoke('delete-user', { body: { userId } });
    if (error) return { error: error.message || 'Failed to delete user' };
    return data || { error: 'Unknown response' };
  } catch (e) {
    return { error: e?.message || 'Network error' };
  }
}

// Invoke the create-user Edge Function. Returns { success: true, userId } or { error: '...' }.
export async function createUserViaEdgeFunction({ email, fullName, role, password }) {
  try {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, fullName, role, password },
    });
    if (error) {
      // Edge function non-2xx responses include the JSON body on error.context
      try {
        const body = await error.context?.json?.();
        if (body?.error) return { error: body.error };
      } catch { /* fall through */ }
      return { error: error.message || 'Failed to create user' };
    }
    return data || { error: 'Unknown response' };
  } catch (e) {
    return { error: e?.message || 'Network error' };
  }
}

// Routed through /api/fmx-credentials so the password is encrypted server-side
// (AES-256-GCM) before hitting the database. The browser never writes the
// plaintext credential directly to Supabase, and the stored value is not
// recoverable without FMX_CRED_KEY.
export async function saveProjectCredentials({ projectId, siteUrl, email, password, verified }) {
  try {
    return await saveFmxCredentialsRequest({ projectId, siteUrl, email, password, verified });
  } catch (e) {
    console.error('saveProjectCredentials failed:', e);
    return null;
  }
}

export async function clearProjectCredentials(projectId) {
  try {
    return await clearFmxCredentialsRequest(projectId);
  } catch (e) {
    console.error('clearProjectCredentials failed:', e);
    return null;
  }
}

export async function updateProjectModules(projectId, modules) {
  return dbQuery(
    () => supabase.from('projects').update({ fmx_modules: modules }).eq('id', projectId).select().single(),
    null
  );
}

// Cache uses a single sentinel row per (project_id, schema_type):
//   record_type = 'custom_fields_cache', fmx_name = '__cache__'
//   extra = { customFields: [...] }

export async function getFmxReferenceCache(projectId, schemaType) {
  return dbQuery(
    () => supabase.from('fmx_reference_cache')
      .select('fmx_name, fmx_id, extra, record_type, cached_at')
      .eq('project_id', projectId)
      .eq('schema_type', schemaType)
      .eq('record_type', 'custom_fields_cache')
      .eq('fmx_name', '__cache__')
      .single(),
    null
  );
}

export async function saveFmxReferenceCache(projectId, schemaType, customFields, systemFields = []) {
  return dbMutate(
    () => supabase.from('fmx_reference_cache').upsert({
      project_id: projectId,
      schema_type: schemaType,
      record_type: 'custom_fields_cache',
      fmx_name: '__cache__',
      fmx_id: null,
      extra: { customFields, systemFields },
      cached_at: new Date().toISOString(),
    }, { onConflict: 'project_id,schema_type,record_type,fmx_name' })
  );
}

// --- DEPENDENCY CACHE ---

export async function saveDependencyCache(projectId, depKey, items, totalCount) {
  try {
    const { error } = await supabase
      .from('fmx_reference_cache')
      .upsert({
        project_id: projectId,
        schema_type: depKey,
        record_type: 'dependency_cache',
        fmx_name: '__dep_cache__',
        fmx_id: null,
        extra: { items, totalCount },
        cached_at: new Date().toISOString(),
      }, { onConflict: 'project_id,schema_type,record_type,fmx_name' });
    return !error;
  } catch {
    return false;
  }
}

export async function getAllDependencyCaches(projectId) {
  try {
    const { data, error } = await supabase
      .from('fmx_reference_cache')
      .select('schema_type, extra, cached_at')
      .eq('project_id', projectId)
      .eq('record_type', 'dependency_cache');
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function getCacheAge(projectId, schemaType) {
  try {
    const cached = await getFmxReferenceCache(projectId, schemaType);
    if (!cached) return Infinity;
    const ageMs = Date.now() - new Date(cached.cached_at).getTime();
    return ageMs / 3600000;
  } catch {
    return Infinity;
  }
}

export async function updateProject(projectId, updates) {
  return dbQuery(
    () => supabase.from('projects').update(updates).eq('id', projectId).select().single(),
    null
  );
}

export async function updateCardSetting(projectId, schemaType, settingKey, value) {
  try {
    const { data: project } = await supabase
      .from('projects').select('card_settings').eq('id', projectId).single();
    const current = project?.card_settings || {};
    const entry = current[schemaType] || {};
    const updated = { ...current, [schemaType]: { ...entry, [settingKey]: value } };
    return updateProject(projectId, { card_settings: updated });
  } catch (e) {
    console.error('updateCardSetting exception:', e);
    return null;
  }
}

export async function deleteProject(projectId) {
  return dbMutate(
    () => supabase.from('projects').delete().eq('id', projectId)
  );
}

// --- PROJECT STATUS ---

export async function getProjectStatus(projectId) {
  try {
    const data = await dbQuery(
      () => supabase.from('project_imports')
        .select('schema_type, row_count, completed_at')
        .eq('project_id', projectId)
        .order('completed_at', { ascending: false }),
      []
    );

    const byType = {};
    for (const row of data) {
      if (!byType[row.schema_type]) {
        byType[row.schema_type] = {
          complete: true,
          rowCount: row.row_count,
          completedAt: row.completed_at,
        };
      }
    }

    const status = {};
    for (const schemaType of IMPORT_ORDER) {
      status[schemaType] = byType[schemaType] ?? { complete: false };
    }
    return status;
  } catch {
    return {};
  }
}

// --- MAPPING MEMORY ---

export async function getMappingSuggestions(schemaType, headers) {
  try {
    const data = await dbQuery(
      () => supabase.from('mapping_memory')
        .select('source_header, fmx_field, confidence')
        .eq('schema_type', schemaType)
        .in('source_header', headers),
      []
    );

    const result = {};
    for (const row of data) {
      result[row.source_header] = {
        fmxField: row.fmx_field,
        confidence: row.confidence,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function saveMappings(schemaType, mappings) {
  const rows = Object.entries(mappings).map(([fmxField, sourceHeader]) => ({
    schema_type: schemaType,
    source_header: sourceHeader,
    fmx_field: fmxField,
    confidence: 1,
    last_used_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return true;
  return dbMutate(
    () => supabase.from('mapping_memory').upsert(rows, {
      onConflict: 'schema_type,source_header',
      ignoreDuplicates: false,
    })
  );
}

// --- RULE MEMORY ---

export async function getSavedRule(schemaType, fmxField) {
  return dbQuery(
    () => supabase.from('rule_memory').select('*')
      .eq('schema_type', schemaType)
      .eq('fmx_field', fmxField)
      .limit(1)
      .single(),
    null
  );
}

export async function saveRule(schemaType, fmxField, instruction, code) {
  return dbMutate(
    () => supabase.from('rule_memory').upsert({
      schema_type: schemaType,
      fmx_field: fmxField,
      instruction,
      generated_code: code,
      use_count: 1,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'schema_type,fmx_field' })
  );
}

// --- DATA PATTERNS ---

export async function getDataPatterns(schemaType, fmxField) {
  const data = await dbQuery(
    () => supabase.from('data_pattern_memory')
      .select('sample_values, pattern_hint')
      .eq('schema_type', schemaType)
      .eq('fmx_field', fmxField)
      .limit(1)
      .single(),
    null
  );
  if (!data) return null;
  return { sampleValues: data.sample_values, patternHint: data.pattern_hint };
}

export async function saveDataPatterns(schemaType, fieldPatterns) {
  const rows = fieldPatterns.map(({ fmxField, sampleValues, patternHint }) => ({
    schema_type: schemaType,
    fmx_field: fmxField,
    sample_values: sampleValues,
    pattern_hint: patternHint,
    confidence: 1,
    last_used_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return true;
  return dbMutate(
    () => supabase.from('data_pattern_memory').upsert(rows, { onConflict: 'schema_type,fmx_field' })
  );
}

export async function getSavedRulesForSchema(schemaType) {
  try {
    const data = await dbQuery(
      () => supabase.from('rule_memory')
        .select('fmx_field, instruction, generated_code')
        .eq('schema_type', schemaType),
      []
    );
    const result = {};
    for (const row of data) {
      result[row.fmx_field] = { instruction: row.instruction, code: row.generated_code };
    }
    return result;
  } catch {
    return {};
  }
}

// --- REFERENCE VALUES ---

export async function getReferenceValues(projectId, schemaType) {
  try {
    const data = await dbQuery(
      () => supabase.from('project_reference_values')
        .select('field_name, value')
        .eq('project_id', projectId)
        .eq('schema_type', schemaType),
      []
    );
    const result = {};
    for (const row of data) {
      if (!result[row.field_name]) result[row.field_name] = [];
      result[row.field_name].push(row.value);
    }
    return result;
  } catch {
    return {};
  }
}

export async function completeImport(
  projectId,
  schemaType,
  rowCount,
  mappingSnapshot,
  referenceValues,
  rowsData = [],
  importName = null,
  sourceFilename = null
) {
  try {
    // Auto-generate import name if not provided
    let name = importName;
    if (!name) {
      const { count } = await supabase
        .from('project_imports')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('schema_type', schemaType);
      const n = (count || 0) + 1;
      name = `${schemaType} - ${String(n).padStart(2, '0')}`;
    }

    const ROW_CAP = 5000;
    const capped = Array.isArray(rowsData) ? rowsData.slice(0, ROW_CAP) : [];
    const truncated = Array.isArray(rowsData) && rowsData.length > ROW_CAP;

    const { data: importRecord, error: importError } = await supabase
      .from('project_imports')
      .insert({
        project_id: projectId,
        schema_type: schemaType,
        row_count: rowCount,
        mapping_snapshot: mappingSnapshot,
        completed_at: new Date().toISOString(),
        import_name: name,
        rows_data: capped,
        row_count_stored: capped.length,
        source_filename: sourceFilename || null,
        truncated,
      })
      .select('id')
      .single();
    if (importError) return null;

    if (referenceValues && referenceValues.length > 0) {
      const rows = referenceValues.map(({ fieldName, value }) => ({
        project_id: projectId,
        schema_type: schemaType,
        field_name: fieldName,
        value,
      }));

      const { error: refError } = await supabase
        .from('project_reference_values')
        .upsert(rows, {
          onConflict: 'project_id,schema_type,field_name,value',
          ignoreDuplicates: true,
        });
      if (refError) return null;
    }

    return importRecord?.id ?? true;
  } catch {
    return null;
  }
}

export async function getProjectImports(projectId) {
  return dbQuery(
    () => supabase.from('project_imports')
      .select('id, schema_type, import_name, row_count, row_count_stored, completed_at, source_filename, truncated, mapping_snapshot')
      .eq('project_id', projectId)
      .order('completed_at', { ascending: false }),
    []
  );
}

export async function getImportRows(importId) {
  const data = await dbQuery(
    () => supabase.from('project_imports').select('rows_data').eq('id', importId).single(),
    null
  );
  return data?.rows_data ?? [];
}

export async function renameImport(importId, newName) {
  return dbMutate(
    () => supabase.from('project_imports').update({ import_name: newName }).eq('id', importId)
  );
}

export async function getAllReferenceValues(projectId) {
  return dbQuery(
    () => supabase.from('project_reference_values')
      .select('schema_type, field_name, value')
      .eq('project_id', projectId)
      .order('schema_type'),
    []
  );
}

// --- FMX PUSHES (for Undo) ---

export async function savePush(projectId, {
  schemaType, mode, siteUrl, endpointBase,
  createdIds, snapshots, rowCount, succeeded, failed,
}) {
  try {
    const { data, error } = await supabase
      .from('project_pushes')
      .insert({
        project_id: projectId,
        schema_type: schemaType,
        mode,
        fmx_site_url: siteUrl,
        endpoint_base: endpointBase,
        created_ids: createdIds ?? null,
        update_snapshots: snapshots ?? null,
        row_count: rowCount,
        succeeded,
        failed,
      })
      .select('id')
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function getProjectPushes(projectId) {
  return dbQuery(
    () => supabase.from('project_pushes')
      .select('id, schema_type, mode, fmx_site_url, endpoint_base, row_count, succeeded, failed, pushed_at, undone_at, undo_result')
      .eq('project_id', projectId)
      .order('pushed_at', { ascending: false }),
    []
  );
}

export async function getPush(pushId) {
  return dbQuery(
    () => supabase.from('project_pushes').select('*').eq('id', pushId).single(),
    null
  );
}

export async function markPushUndone(pushId, undoResult) {
  return dbMutate(
    () => supabase.from('project_pushes')
      .update({ undone_at: new Date().toISOString(), undo_result: undoResult })
      .eq('id', pushId)
  );
}

// --- PROMPTS (PDF extraction) ---

export async function getActivePrompt(migrationType, stage = 'extraction') {
  return dbQuery(
    () => supabase.from('prompts')
      .select('id, migration_type, stage, version, body, active, notes')
      .eq('migration_type', migrationType)
      .eq('stage', stage)
      .eq('active', true)
      .limit(1)
      .maybeSingle(),
    null
  );
}

export async function getAllPrompts() {
  return dbQuery(
    () => supabase.from('prompts')
      .select('id, migration_type, stage, version, body, active, notes, created_at, created_by')
      .order('migration_type')
      .order('stage')
      .order('version', { ascending: false }),
    []
  );
}

// Adds a new version for (migration_type, stage); if makeActive, flips off any prior active row
// in the same (migration_type, stage) so the single-active uniqueness constraint is preserved.
export async function createPromptVersion({ migrationType, stage = 'extraction', body, notes, makeActive = true, createdBy = null }) {
  try {
    const { data: existing } = await supabase.from('prompts')
      .select('version')
      .eq('migration_type', migrationType)
      .eq('stage', stage)
      .order('version', { ascending: false })
      .limit(1);
    const nextVersion = (existing?.[0]?.version || 0) + 1;

    if (makeActive) {
      await supabase.from('prompts')
        .update({ active: false })
        .eq('migration_type', migrationType)
        .eq('stage', stage)
        .eq('active', true);
    }

    const { data, error } = await supabase.from('prompts')
      .insert({
        migration_type: migrationType,
        stage,
        version: nextVersion,
        body,
        notes: notes || null,
        active: makeActive,
        created_by: createdBy,
      })
      .select()
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function activatePromptVersion(promptId) {
  try {
    const { data: target } = await supabase.from('prompts')
      .select('migration_type, stage')
      .eq('id', promptId)
      .single();
    if (!target) return false;
    await supabase.from('prompts')
      .update({ active: false })
      .eq('migration_type', target.migration_type)
      .eq('stage', target.stage)
      .eq('active', true);
    const { error } = await supabase.from('prompts')
      .update({ active: true })
      .eq('id', promptId);
    return !error;
  } catch {
    return false;
  }
}

// --- EXTRACTION RUNS ---

export async function createExtractionRun({ projectId, userId, migrationType, stage = 'extraction', storageKey, sourceFilename, pageCount, promptId, promptVersion, dryRun = false, dryRunSourceRunId = null }) {
  return dbQuery(
    () => supabase.from('extraction_runs').insert({
      project_id: projectId || null,
      user_id: userId || null,
      migration_type: migrationType,
      stage,
      storage_key: storageKey || null,
      source_filename: sourceFilename || null,
      page_count: pageCount || null,
      prompt_id: promptId || null,
      prompt_version: promptVersion || null,
      status: 'running',
      dry_run: !!dryRun,
      dry_run_source_run_id: dryRunSourceRunId || null,
    }).select().single(),
    null
  );
}

export async function completeExtractionRun(runId, { status, resultJson, error, durationMs, inputTokens, outputTokens, estimatedCostUsd }) {
  return dbMutate(
    () => supabase.from('extraction_runs').update({
      status,
      result_json: resultJson || null,
      error: error || null,
      duration_ms: durationMs || null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      estimated_cost_usd: estimatedCostUsd ?? null,
    }).eq('id', runId)
  );
}

export async function getExtractionRuns(projectId) {
  return dbQuery(
    () => supabase.from('extraction_runs')
      .select('id, migration_type, source_filename, page_count, prompt_version, status, error, duration_ms, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50),
    []
  );
}

export async function getExtractionRun(runId) {
  return dbQuery(
    () => supabase.from('extraction_runs')
      .select('id, project_id, user_id, migration_type, stage, storage_key, source_filename, page_count, prompt_id, prompt_version, status, result_json, error, duration_ms, input_tokens, output_tokens, estimated_cost_usd, dry_run, dry_run_source_run_id, created_at')
      .eq('id', runId)
      .single(),
    null
  );
}

export async function getPromptById(promptId) {
  return dbQuery(
    () => supabase.from('prompts')
      .select('id, migration_type, stage, version, body, active, notes, created_at')
      .eq('id', promptId)
      .single(),
    null
  );
}

export async function getCorrectionsForRun(runId) {
  return dbQuery(
    () => supabase.from('corrections')
      .select('id, correction_type, field_path, row_index, original_value, corrected_value, reviewed, promoted_example_id, created_at')
      .eq('extraction_run_id', runId)
      .order('created_at', { ascending: true }),
    []
  );
}

// Returns a short-lived signed URL for downloading the original PDF from
// Storage, or null if the run has no storage_key / the fetch fails.
export async function getPdfSignedUrl(storageKey, expiresInSeconds = 300) {
  if (!storageKey) return null;
  try {
    const { data, error } = await supabase.storage
      .from('pdf-uploads')
      .createSignedUrl(storageKey, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

// Downloads a PDF from Storage as a File object — used by the re-run flow.
export async function downloadPdfFromStorage(storageKey, filename = 'run.pdf') {
  if (!storageKey) return null;
  try {
    const { data, error } = await supabase.storage
      .from('pdf-uploads')
      .download(storageKey);
    if (error || !data) return null;
    return new File([data], filename, { type: 'application/pdf' });
  } catch {
    return null;
  }
}

export async function getAllExtractionRuns({ limit = 100 } = {}) {
  return dbQuery(
    () => supabase.from('extraction_runs')
      .select('id, project_id, user_id, migration_type, stage, source_filename, page_count, prompt_id, prompt_version, status, error, duration_ms, input_tokens, output_tokens, estimated_cost_usd, dry_run, dry_run_source_run_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    []
  );
}

// Lists recent *successful*, *non-dry-run* runs of a given (migration_type, stage)
// that can be used as a dry-run sample. Ordered most-recent-first. Extraction
// runs must have a storage_key so we can actually re-render the PDF.
export async function listRecentRunsForReplay(migrationType, stage = 'extraction', limit = 25) {
  try {
    let q = supabase.from('extraction_runs')
      .select('id, migration_type, stage, storage_key, source_filename, page_count, result_json, input_tokens, output_tokens, estimated_cost_usd, duration_ms, created_at')
      .eq('migration_type', migrationType)
      .eq('stage', stage)
      .eq('status', 'complete')
      .eq('dry_run', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (stage === 'extraction') q = q.not('storage_key', 'is', null);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

// --- CORRECTIONS (PDF extraction learning loop) ---

// Writes a batch of corrections in a single round-trip. Caller passes an array
// of { correctionType, fieldPath, rowIndex, originalValue, correctedValue }.
export async function recordCorrections({ extractionRunId, migrationType, userId, entries }) {
  if (!entries?.length) return true;
  const rows = entries.map(e => ({
    extraction_run_id: extractionRunId || null,
    migration_type: migrationType,
    correction_type: e.correctionType,
    field_path: e.fieldPath,
    row_index: e.rowIndex ?? null,
    original_value: e.originalValue ?? null,
    corrected_value: e.correctedValue ?? null,
    user_id: userId || null,
  }));
  return dbMutate(() => supabase.from('corrections').insert(rows));
}

export async function getCorrections({ migrationType, reviewed, limit = 500 } = {}) {
  try {
    let q = supabase.from('corrections')
      .select('id, extraction_run_id, migration_type, correction_type, field_path, row_index, original_value, corrected_value, reviewed, promoted_example_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (migrationType) q = q.eq('migration_type', migrationType);
    if (reviewed !== undefined) q = q.eq('reviewed', reviewed);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function markCorrectionsReviewed(ids) {
  if (!ids?.length) return true;
  return dbMutate(
    () => supabase.from('corrections').update({ reviewed: true }).in('id', ids)
  );
}

// --- PROMPT EXAMPLES (few-shot) ---

export async function getExamplesForPrompt(promptId) {
  return dbQuery(
    () => supabase.from('prompt_examples')
      .select('id, prompt_id, example_json, label, enabled, use_count, last_used_at, promoted_from_correction_id, created_at')
      .eq('prompt_id', promptId)
      .order('created_at', { ascending: false }),
    []
  );
}

export async function getEnabledExamplesForPrompt(promptId) {
  return dbQuery(
    () => supabase.from('prompt_examples')
      .select('id, example_json, label')
      .eq('prompt_id', promptId)
      .eq('enabled', true)
      .order('created_at', { ascending: true }),
    []
  );
}

// Promote a correction → prompt_example. Links both directions:
//   corrections.promoted_example_id ↔ prompt_examples.promoted_from_correction_id
export async function promoteCorrectionToExample({ correctionId, promptId, exampleJson, label, createdBy }) {
  try {
    const { data: example, error } = await supabase.from('prompt_examples')
      .insert({
        prompt_id: promptId,
        example_json: exampleJson,
        label: label || null,
        enabled: true,
        promoted_from_correction_id: correctionId || null,
        created_by: createdBy || null,
      })
      .select()
      .single();
    if (error) return null;
    if (correctionId) {
      await supabase.from('corrections')
        .update({ promoted_example_id: example.id, reviewed: true })
        .eq('id', correctionId);
    }
    return example;
  } catch {
    return null;
  }
}

export async function setExampleEnabled(exampleId, enabled) {
  return dbMutate(
    () => supabase.from('prompt_examples').update({ enabled }).eq('id', exampleId)
  );
}

export async function deleteExample(exampleId) {
  return dbMutate(
    () => supabase.from('prompt_examples').delete().eq('id', exampleId)
  );
}

// Fire-and-forget: bumps use counters after an extraction injects examples.
// Called from the client because Supabase doesn't do RPC increments natively
// via the JS SDK without a stored function; small race windows are fine.
export async function incrementExampleUsage(exampleIds) {
  if (!exampleIds?.length) return true;
  try {
    const { data } = await supabase.from('prompt_examples')
      .select('id, use_count')
      .in('id', exampleIds);
    if (!data) return false;
    const now = new Date().toISOString();
    await Promise.all(
      data.map(row => supabase.from('prompt_examples')
        .update({ use_count: (row.use_count || 0) + 1, last_used_at: now })
        .eq('id', row.id)
      )
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Field overrides (admin-editable required-flag rules) ──────────────
// Migration 017. The override table lets admins correct a field's required
// status without a redeploy. Lookup precedence at validation time is:
//   admin override  >  API /post-options  >  FMX_FIELD_ENRICHMENTS default.

/**
 * Fetch all field overrides. Returned as a nested map
 *   { [schemaType]: { [fieldName]: { is_required, notes, updated_at } } }
 * so callers can do `overrides[schemaType]?.[fieldName]?.is_required`.
 * Includes both base schemas ("Work Task") and module-qualified variants.
 */
export async function getFieldOverrides() {
  try {
    const { data, error } = await supabase
      .from('field_overrides')
      .select('schema_type, field_name, is_required, notes, updated_at');
    if (error) return {};
    const map = {};
    for (const row of data || []) {
      if (!map[row.schema_type]) map[row.schema_type] = {};
      map[row.schema_type][row.field_name] = {
        is_required: row.is_required,
        notes: row.notes,
        updated_at: row.updated_at,
      };
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Upsert a single override row. Pass `isRequired=null` to explicitly record
 * "no opinion" (falls back to API/enrichment). Pass the whole field in
 * `values` if you want to clear both is_required and notes.
 * Admin-only by RLS.
 */
export async function upsertFieldOverride(schemaType, fieldName, values, userId) {
  try {
    const payload = {
      schema_type: schemaType,
      field_name: fieldName,
      is_required: values.is_required ?? null,
      notes: values.notes ?? null,
      updated_by: userId || null,
    };
    const { error } = await supabase
      .from('field_overrides')
      .upsert(payload, { onConflict: 'schema_type,field_name' });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete an override row (admin-only). Useful when an admin wants to
 * revert to API/enrichment defaults without leaving a null-valued row.
 */
export async function deleteFieldOverride(schemaType, fieldName) {
  try {
    const { error } = await supabase
      .from('field_overrides')
      .delete()
      .eq('schema_type', schemaType)
      .eq('field_name', fieldName);
    return !error;
  } catch {
    return false;
  }
}
