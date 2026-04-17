import { supabase } from './supabase';
import { IMPORT_ORDER } from './schemas';

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

export async function createProject(name, description, fmxSiteUrl, encodedCredentials, connectionVerified = false, userId = null) {
  return dbQuery(
    () => supabase.from('projects').insert({
      name,
      description: description || null,
      fmx_site_url: fmxSiteUrl || null,
      fmx_credentials: encodedCredentials || null,
      fmx_connection_verified: connectionVerified,
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

export async function saveProjectCredentials(projectId, encodedCredentials, connectionVerified) {
  return dbQuery(
    () => supabase.from('projects').update({
      fmx_credentials: encodedCredentials,
      fmx_connection_verified: connectionVerified,
    }).eq('id', projectId).select().single(),
    null
  );
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
