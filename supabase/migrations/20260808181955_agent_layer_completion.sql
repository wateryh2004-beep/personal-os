-- Finish the Agent layer: private file text extraction and owner-filtered Realtime.

alter table public.documents
  add column if not exists text_extraction_status text not null default 'not_requested'
    check (text_extraction_status in ('not_requested','pending','processing','completed','unsupported','too_large','failed')),
  add column if not exists extracted_text text,
  add column if not exists extracted_character_count integer not null default 0
    check (extracted_character_count >= 0 and extracted_character_count <= 300000),
  add column if not exists text_extraction_error_code text,
  add column if not exists text_extracted_at timestamptz;

create index if not exists documents_text_extraction_queue_idx
  on public.documents (user_id, text_extraction_status, updated_at)
  where archived_at is null and storage_state = 'available';

update public.documents
set text_extraction_status = case
  when file_size > 20971520 then 'too_large'
  when lower(original_filename) ~ '\.(pdf|docx|txt|md|markdown|csv|json|xml|ya?ml|log)$'
    or lower(mime_type) like 'text/%'
    or lower(mime_type) in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/json',
      'application/xml',
      'application/x-yaml',
      'application/yaml'
    ) then 'pending'
  else 'unsupported'
end
where storage_provider = 'cloudflare_r2'
  and storage_state = 'available'
  and text_extraction_status = 'not_requested';

-- Keep the search index private while allowing extracted text to be found.
create or replace function public.sync_search_document() returns trigger
language plpgsql set search_path=public as $$
declare
  entity text:=tg_table_name; domain_value text; title_value text;
  content_value text; subtitle_value text:=''; row_id uuid; owner uuid;
  archived boolean:=false;
begin
  if tg_op='DELETE' then
    delete from public.search_documents where entity_type=entity and entity_id=old.id;
    return old;
  end if;
  row_id:=new.id; owner:=new.user_id; archived:=new.archived_at is not null;
  if entity='notes' then
    domain_value:='notes'; entity:='note'; title_value:=new.title;
    content_value:=new.body_markdown;
    archived:=archived or new.deleted_at is not null or new.status='trashed';
  elsif entity='experiences' then
    domain_value:='career'; entity:='experience';
    title_value:=concat_ws(' · ',new.organization,new.role);
    content_value:=concat_ws(' ',new.background_markdown,new.raw_description_markdown);
  elsif entity='career_directions' then
    domain_value:='career'; entity:='career_direction'; title_value:=new.name;
    content_value:=concat_ws(' ',new.description,new.hypothesis_markdown,new.supporting_evidence_markdown,new.opposing_evidence_markdown,new.current_decision);
  elsif entity='documents' then
    domain_value:='files'; entity:='document'; title_value:=new.title;
    subtitle_value:=new.original_filename;
    content_value:=concat_ws(' ',new.mime_type,new.original_filename,new.extracted_text);
    archived:=archived or new.storage_state='archived';
  elsif entity='microsoft_todo_tasks' then
    domain_value:='tasks'; entity:='todo_task'; title_value:=new.title;
    content_value:=coalesce(new.body_text,'');
  elsif entity='calendar_events' then
    domain_value:='calendar'; entity:='calendar_event'; title_value:=new.subject;
    subtitle_value:=coalesce(new.location_name,''); content_value:=coalesce(new.location_name,'');
  else return new;
  end if;
  if archived then
    delete from public.search_documents where entity_type=entity and entity_id=row_id;
    return new;
  end if;
  insert into public.search_documents(
    user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at
  ) values (
    owner,domain_value,entity,row_id,coalesce(title_value,''),subtitle_value,
    content_value,jsonb_build_object('source_table',tg_table_name),new.updated_at
  ) on conflict(user_id,entity_type,entity_id) do update set
    title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,
    source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end $$;

-- Postgres Changes still passes through each table's auth.uid() RLS policies.
do $$
declare v_table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table_name in array array['agent_runs','agent_messages','agent_steps','agent_actions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table_name);
      end if;
    end loop;
  end if;
end $$;
