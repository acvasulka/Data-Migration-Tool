-- Remove org_id columns from all tables
alter table projects drop column if exists org_id;
alter table mapping_memory drop column if exists org_id;
alter table rule_memory drop column if exists org_id;
alter table data_pattern_memory drop column if exists org_id;

-- Re-add simpler unique constraints (without org_id)
alter table mapping_memory drop constraint if exists mapping_memory_org_id_schema_type_source_header_key;
alter table mapping_memory add constraint mapping_memory_schema_source_unique unique(schema_type, source_header);

alter table rule_memory drop constraint if exists rule_memory_org_id_schema_type_fmx_field_key;
alter table rule_memory add constraint rule_memory_schema_field_unique unique(schema_type, fmx_field);

alter table data_pattern_memory drop constraint if exists data_pattern_memory_org_id_schema_type_fmx_field_key;
alter table data_pattern_memory add constraint data_pattern_memory_schema_field_unique unique(schema_type, fmx_field);

-- Drop organizations table and profiles org_id reference
alter table profiles drop column if exists org_id;
drop table if exists organizations cascade;

-- Drop old org-scoped RLS policies
drop policy if exists "org members can see their org" on organizations;
drop policy if exists "org members can see their projects" on projects;
drop policy if exists "org members can see project imports" on project_imports;
drop policy if exists "org members can see reference values" on project_reference_values;
drop policy if exists "org members can see mapping memory" on mapping_memory;
drop policy if exists "org members can see rule memory" on rule_memory;
drop policy if exists "org members can see data patterns" on data_pattern_memory;

-- New simple policies: any authenticated user can access everything
create policy "authenticated users can access projects"
  on projects for all using (auth.role() = 'authenticated');

create policy "authenticated users can access project_imports"
  on project_imports for all using (auth.role() = 'authenticated');

create policy "authenticated users can access reference values"
  on project_reference_values for all using (auth.role() = 'authenticated');

create policy "authenticated users can access mapping memory"
  on mapping_memory for all using (auth.role() = 'authenticated');

create policy "authenticated users can access rule memory"
  on rule_memory for all using (auth.role() = 'authenticated');

create policy "authenticated users can access data patterns"
  on data_pattern_memory for all using (auth.role() = 'authenticated');

create policy "authenticated users can access profiles"
  on profiles for all using (auth.uid() = id);
