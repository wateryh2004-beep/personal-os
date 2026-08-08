create extension if not exists pg_trgm;
create table public.search_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('notes','career','files','tasks','calendar')), entity_type text not null, entity_id uuid not null,
  title text not null default '', subtitle text not null default '', content_text text not null default '', metadata jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz, search_vector tsvector generated always as (setweight(to_tsvector('simple', title),'A') || setweight(to_tsvector('simple', subtitle),'B') || setweight(to_tsvector('simple', content_text),'C')) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, entity_type, entity_id)
);
create index search_documents_vector_idx on public.search_documents using gin(search_vector);
create index search_documents_title_trgm_idx on public.search_documents using gin(title gin_trgm_ops);
create index search_documents_content_trgm_idx on public.search_documents using gin(content_text gin_trgm_ops);
create index search_documents_owner_domain_idx on public.search_documents(user_id,domain,source_updated_at desc);
alter table public.search_documents enable row level security;
create policy "search_documents_select_own" on public.search_documents for select to authenticated using ((select auth.uid())=user_id);
create policy "search_documents_insert_own" on public.search_documents for insert to authenticated with check ((select auth.uid())=user_id);
create policy "search_documents_update_own" on public.search_documents for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "search_documents_delete_own" on public.search_documents for delete to authenticated using ((select auth.uid())=user_id);

create or replace function public.sync_search_document() returns trigger language plpgsql set search_path=public as $$
declare entity text:=tg_table_name; domain_value text; title_value text; content_value text; subtitle_value text:=''; row_id uuid; owner uuid; archived boolean:=false;
begin
  if tg_op='DELETE' then delete from public.search_documents where entity_type=entity and entity_id=old.id; return old; end if;
  row_id:=new.id; owner:=new.user_id; archived:=new.archived_at is not null;
  if entity='notes' then domain_value:='notes'; entity:='note'; title_value:=new.title; content_value:=new.body_markdown; archived:=archived or new.deleted_at is not null or new.status='trashed';
  elsif entity='experiences' then domain_value:='career'; entity:='experience'; title_value:=concat_ws(' · ',new.organization,new.role); content_value:=concat_ws(' ',new.background_markdown,new.raw_description_markdown);
  elsif entity='career_directions' then domain_value:='career'; entity:='career_direction'; title_value:=new.name; content_value:=concat_ws(' ',new.description,new.hypothesis_markdown,new.supporting_evidence_markdown,new.opposing_evidence_markdown,new.current_decision);
  elsif entity='documents' then domain_value:='files'; entity:='document'; title_value:=new.title; subtitle_value:=new.original_filename; content_value:=concat_ws(' ',new.mime_type,new.original_filename); archived:=archived or new.storage_state='archived';
  elsif entity='microsoft_todo_tasks' then domain_value:='tasks'; entity:='todo_task'; title_value:=new.title; content_value:=coalesce(new.body_text,'');
  elsif entity='calendar_events' then domain_value:='calendar'; entity:='calendar_event'; title_value:=new.subject; subtitle_value:=coalesce(new.location_name,''); content_value:=coalesce(new.location_name,'');
  else return new; end if;
  if archived then delete from public.search_documents where entity_type=entity and entity_id=row_id; return new; end if;
  insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at) values(owner,domain_value,entity,row_id,coalesce(title_value,''),subtitle_value,content_value,jsonb_build_object('source_table',tg_table_name),new.updated_at) on conflict(user_id,entity_type,entity_id) do update set title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,source_updated_at=excluded.source_updated_at,updated_at=now(); return new;
end $$;
create trigger search_notes after insert or update or delete on public.notes for each row execute procedure public.sync_search_document();
create trigger search_experiences after insert or update or delete on public.experiences for each row execute procedure public.sync_search_document();
create trigger search_directions after insert or update or delete on public.career_directions for each row execute procedure public.sync_search_document();
create trigger search_documents after insert or update or delete on public.documents for each row execute procedure public.sync_search_document();
create trigger search_todos after insert or update or delete on public.microsoft_todo_tasks for each row execute procedure public.sync_search_document();
create trigger search_calendar after insert or update or delete on public.calendar_events for each row execute procedure public.sync_search_document();
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,content_text,source_updated_at) select user_id,'notes','note',id,title,body_markdown,updated_at from public.notes where deleted_at is null and status <> 'trashed' on conflict do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,content_text,source_updated_at) select user_id,'career','experience',id,concat_ws(' · ',organization,role),concat_ws(' ',background_markdown,raw_description_markdown),updated_at from public.experiences where archived_at is null on conflict do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,content_text,source_updated_at) select user_id,'tasks','todo_task',id,title,coalesce(body_text,''),updated_at from public.microsoft_todo_tasks where archived_at is null on conflict do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at) select user_id,'calendar','calendar_event',id,subject,coalesce(location_name,''),coalesce(location_name,''),updated_at from public.calendar_events where archived_at is null on conflict do nothing;
create or replace function public.search_personal_os(p_query text,p_limit integer default 30,p_domains text[] default null) returns table(domain text,entity_type text,entity_id uuid,title text,subtitle text,snippet text,metadata jsonb,source_updated_at timestamptz,score real) language sql security invoker set search_path=public as $$ select s.domain,s.entity_type,s.entity_id,s.title,s.subtitle,left(regexp_replace(s.content_text,'[#*_\[\]]','','g'),240),s.metadata,s.source_updated_at,((case when lower(s.title)=lower(trim(p_query)) then 100 when s.title ilike trim(p_query)||'%' then 40 when s.title ilike '%'||replace(replace(replace(trim(p_query),'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\' then 20 else 0 end)+ts_rank_cd(s.search_vector,plainto_tsquery('simple',trim(p_query))) * 20+(case when s.content_text ilike '%'||replace(replace(replace(trim(p_query),'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\' then 5 else 0 end))::real as score from public.search_documents s where length(trim(p_query))>0 and (p_domains is null or s.domain=any(p_domains)) and (s.search_vector @@ plainto_tsquery('simple',trim(p_query)) or s.title ilike '%'||replace(replace(replace(trim(p_query),'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\' or s.content_text ilike '%'||replace(replace(replace(trim(p_query),'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\') order by score desc,s.source_updated_at desc nulls last limit greatest(1,least(p_limit,50)); $$;
