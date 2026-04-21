alter table project_imports add column if not exists import_name text;
alter table project_imports add column if not exists rows_data jsonb;
alter table project_imports add column if not exists row_count_stored int;
alter table project_imports add column if not exists source_filename text;
alter table project_imports add column if not exists truncated boolean default false;
