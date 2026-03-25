import { supabase } from './supabase';
import { IMPORT_ORDER } from './schemas';

// --- ORGANIZATIONS ---

export async function getOrgBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .limit(1)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// --- PROJECTS ---

export async function getProjects(orgId) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function createProject(orgId, name, description, fmxSiteUrl) {
  if (!orgId) {
    console.error('createProject called with null orgId');
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({ org_id: orgId, name, description, fmx_site_url: fmxSiteUrl })
      .select()
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
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

export async function getMappingSuggestions(orgId, schemaType, headers) {
  try {
    const { data, error } = await supabase
      .from('mapping_memory')
      .select('source_header, fmx_field, confidence')
      .eq('org_id', orgId)
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

export async function saveMappings(orgId, schemaType, mappings) {
  try {
    const rows = Object.entries(mappings).map(([fmxField, sourceHeader]) => ({
      org_id: orgId,
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
        onConflict: 'org_id,schema_type,source_header',
        ignoreDuplicates: false,
      });
    return !error;
  } catch {
    return false;
  }
}

// --- RULE MEMORY ---

export async function getSavedRule(orgId, schemaType, fmxField) {
  try {
    const { data, error } = await supabase
      .from('rule_memory')
      .select('*')
      .eq('org_id', orgId)
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

export async function saveRule(orgId, schemaType, fmxField, instruction, code) {
  try {
    const { error } = await supabase
      .from('rule_memory')
      .upsert(
        {
          org_id: orgId,
          schema_type: schemaType,
          fmx_field: fmxField,
          instruction,
          generated_code: code,
          use_count: 1,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,schema_type,fmx_field' }
      );
    return !error;
  } catch {
    return false;
  }
}

// --- DATA PATTERNS ---

export async function getDataPatterns(orgId, schemaType, fmxField) {
  try {
    const { data, error } = await supabase
      .from('data_pattern_memory')
      .select('sample_values, pattern_hint')
      .eq('org_id', orgId)
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

export async function saveDataPatterns(orgId, schemaType, fieldPatterns) {
  try {
    const rows = fieldPatterns.map(({ fmxField, sampleValues, patternHint }) => ({
      org_id: orgId,
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
      .upsert(rows, { onConflict: 'org_id,schema_type,fmx_field' });
    return !error;
  } catch {
    return false;
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
  referenceValues
) {
  try {
    const { error: importError } = await supabase
      .from('project_imports')
      .insert({
        project_id: projectId,
        schema_type: schemaType,
        row_count: rowCount,
        mapping_snapshot: mappingSnapshot,
        completed_at: new Date().toISOString(),
      });
    if (importError) return false;

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
      if (refError) return false;
    }

    return true;
  } catch {
    return false;
  }
}
