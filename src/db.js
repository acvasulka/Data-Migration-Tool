import { supabase } from './supabase';
import { IMPORT_ORDER } from './schemas';

// --- PROJECTS ---

export async function getProjects() {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('getProjects error:', error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('getProjects exception:', e);
    return [];
  }
}

export async function createProject(name, description, fmxSiteUrl, encodedCredentials, connectionVerified = false) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name,
        description: description || null,
        fmx_site_url: fmxSiteUrl || null,
        fmx_credentials: encodedCredentials || null,
        fmx_connection_verified: connectionVerified,
      })
      .select()
      .single();
    if (error) {
      console.error('createProject error:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('createProject exception:', e);
    return null;
  }
}

export async function saveProjectCredentials(projectId, encodedCredentials, connectionVerified) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({
        fmx_credentials: encodedCredentials,
        fmx_connection_verified: connectionVerified,
      })
      .eq('id', projectId)
      .select()
      .single();
    if (error) { console.error('saveProjectCredentials error:', error); return null; }
    return data;
  } catch (e) {
    console.error('saveProjectCredentials exception:', e);
    return null;
  }
}

export async function updateProjectModules(projectId, modules) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({ fmx_modules: modules })
      .eq('id', projectId)
      .select()
      .single();
    if (error) { console.error('updateProjectModules error:', error); return null; }
    return data;
  } catch (e) {
    console.error('updateProjectModules exception:', e);
    return null;
  }
}

// Cache uses a single sentinel row per (project_id, schema_type):
//   record_type = 'custom_fields_cache', fmx_name = '__cache__'
//   extra = { customFields: [...] }

export async function getFmxReferenceCache(projectId, schemaType) {
  try {
    const { data, error } = await supabase
      .from('fmx_reference_cache')
      .select('fmx_name, fmx_id, extra, record_type, cached_at')
      .eq('project_id', projectId)
      .eq('schema_type', schemaType)
      .eq('record_type', 'custom_fields_cache')
      .eq('fmx_name', '__cache__')
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveFmxReferenceCache(projectId, schemaType, customFields, systemFields = []) {
  try {
    const { error } = await supabase
      .from('fmx_reference_cache')
      .upsert({
        project_id: projectId,
        schema_type: schemaType,
        record_type: 'custom_fields_cache',
        fmx_name: '__cache__',
        fmx_id: null,
        extra: { customFields, systemFields },
        cached_at: new Date().toISOString(),
      }, { onConflict: 'project_id,schema_type,record_type,fmx_name' });
    return !error;
  } catch {
    return false;
  }
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
  try {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function deleteProject(projectId) {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    return !error;
  } catch {
    return false;
  }
}

// --- PROJECT STATUS ---

export async function getProjectStatus(projectId) {
  try {
    const { data, error } = await supabase
      .from('project_imports')
      .select('schema_type, row_count, completed_at')
      .eq('project_id', projectId)
      .order('completed_at', { ascending: false });
    if (error) return {};

    const byType = {};
    for (const row of data ?? []) {
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
    const { data, error } = await supabase
      .from('mapping_memory')
      .select('source_header, fmx_field, confidence')
      .eq('schema_type', schemaType)
      .in('source_header', headers);
    if (error) return {};

    const result = {};
    for (const row of data ?? []) {
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
  try {
    const rows = Object.entries(mappings).map(([fmxField, sourceHeader]) => ({
      schema_type: schemaType,
      source_header: sourceHeader,
      fmx_field: fmxField,
      confidence: 1,
      last_used_at: new Date().toISOString(),
    }));

    if (rows.length === 0) return true;

    const { error } = await supabase
      .from('mapping_memory')
      .upsert(rows, {
        onConflict: 'schema_type,source_header',
        ignoreDuplicates: false,
      });
    return !error;
  } catch {
    return false;
  }
}

// --- RULE MEMORY ---

export async function getSavedRule(schemaType, fmxField) {
  try {
    const { data, error } = await supabase
      .from('rule_memory')
      .select('*')
      .eq('schema_type', schemaType)
      .eq('fmx_field', fmxField)
      .limit(1)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveRule(schemaType, fmxField, instruction, code) {
  try {
    const { error } = await supabase
      .from('rule_memory')
      .upsert(
        {
          schema_type: schemaType,
          fmx_field: fmxField,
          instruction,
          generated_code: code,
          use_count: 1,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'schema_type,fmx_field' }
      );
    return !error;
  } catch {
    return false;
  }
}

// --- DATA PATTERNS ---

export async function getDataPatterns(schemaType, fmxField) {
  try {
    const { data, error } = await supabase
      .from('data_pattern_memory')
      .select('sample_values, pattern_hint')
      .eq('schema_type', schemaType)
      .eq('fmx_field', fmxField)
      .limit(1)
      .single();
    if (error) return null;
    return { sampleValues: data.sample_values, patternHint: data.pattern_hint };
  } catch {
    return null;
  }
}

export async function saveDataPatterns(schemaType, fieldPatterns) {
  try {
    const rows = fieldPatterns.map(({ fmxField, sampleValues, patternHint }) => ({
      schema_type: schemaType,
      fmx_field: fmxField,
      sample_values: sampleValues,
      pattern_hint: patternHint,
      confidence: 1,
      last_used_at: new Date().toISOString(),
    }));

    if (rows.length === 0) return true;

    const { error } = await supabase
      .from('data_pattern_memory')
      .upsert(rows, { onConflict: 'schema_type,fmx_field' });
    return !error;
  } catch {
    return false;
  }
}

export async function getSavedRulesForSchema(schemaType) {
  try {
    const { data, error } = await supabase
      .from('rule_memory')
      .select('fmx_field, instruction, generated_code')
      .eq('schema_type', schemaType);
    if (error) return {};
    const result = {};
    for (const row of data ?? []) {
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
    const { data, error } = await supabase
      .from('project_reference_values')
      .select('field_name, value')
      .eq('project_id', projectId)
      .eq('schema_type', schemaType);
    if (error) return {};

    const result = {};
    for (const row of data ?? []) {
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
  try {
    const { data, error } = await supabase
      .from('project_imports')
      .select('id, schema_type, import_name, row_count, row_count_stored, completed_at, source_filename, truncated, mapping_snapshot')
      .eq('project_id', projectId)
      .order('completed_at', { ascending: false });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getImportRows(importId) {
  try {
    const { data, error } = await supabase
      .from('project_imports')
      .select('rows_data')
      .eq('id', importId)
      .single();
    if (error) return [];
    return data?.rows_data ?? [];
  } catch {
    return [];
  }
}

export async function renameImport(importId, newName) {
  try {
    const { error } = await supabase
      .from('project_imports')
      .update({ import_name: newName })
      .eq('id', importId);
    return !error;
  } catch {
    return false;
  }
}

export async function getAllReferenceValues(projectId) {
  try {
    const { data, error } = await supabase
      .from('project_reference_values')
      .select('schema_type, field_name, value')
      .eq('project_id', projectId)
      .order('schema_type');
    if (error) { console.error('getAllReferenceValues error:', error); return []; }
    return data || [];
  } catch (e) {
    console.error('getAllReferenceValues exception:', e);
    return [];
  }
}
