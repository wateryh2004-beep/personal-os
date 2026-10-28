-- Run only in a fresh disposable PostgreSQL database, via psql -v ON_ERROR_STOP=1.
\set ON_ERROR_STOP on
-- Supabase role names are required by the real migrations in this isolated database.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.experience_library_entries(id uuid primary key,user_id uuid not null, source_url text,title text not null,tags text[] not null default '{}',ai_summary text,ai_status text default 'not_requested',ai_error_code text,ai_provider text,ai_model text,ai_analyzed_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now(),archived_at timestamptz);
create table public.experience_library_captures(id uuid primary key,user_id uuid,entry_id uuid,raw_content text,created_at timestamptz default now());
create table public.documents (id uuid primary key,user_id uuid not null, archived_at timestamptz, storage_state text, ai_visibility text, extracted_text text, text_extraction_method text, text_extraction_source_sha256 text, text_extracted_at timestamptz);
create table public.experience_library_media(id uuid primary key,user_id uuid,entry_id uuid,archived_at timestamptz,document_id uuid references public.documents(id),created_at timestamptz default now());
create table public.microsoft_todo_tasks(id uuid primary key,user_id uuid not null, archived_at timestamptz);
alter table public.experience_library_entries enable row level security;
alter table public.experience_library_captures enable row level security;
alter table public.experience_library_media enable row level security;
alter table public.documents enable row level security;
alter table public.microsoft_todo_tasks enable row level security;
create policy own_entry on public.experience_library_entries to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_capture on public.experience_library_captures to authenticated using(user_id=auth.uid());
create policy own_media on public.experience_library_media to authenticated using(user_id=auth.uid());
create policy own_documents on public.documents to authenticated using(user_id=auth.uid());
create policy own_tasks on public.microsoft_todo_tasks to authenticated using(user_id=auth.uid());
grant select,update on public.experience_library_entries,public.documents to authenticated;
grant select on public.experience_library_captures,public.experience_library_media,public.documents,public.microsoft_todo_tasks to authenticated;
\ir ../supabase/migrations/20261028123909_experience_library_notes_filters.sql
\ir ../supabase/migrations/20261028134445_experience_library_ocr_sources_actions.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.experience_library_entries(id,user_id,title,tags,ai_status) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Alpha',array['面试'],'completed'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Private',array['面试'],'completed');
insert into public.documents values ('aaaaaaaa-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',null,'available','sensitive','截图文字：报名截止十月','ocr_local',repeat('a',64),null), ('bbbbbbbb-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',null,'available','sensitive','秘密截图','ocr_local',repeat('b',64),null);
insert into public.experience_library_media(id,user_id,entry_id,document_id) values ('aaaaaaaa-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-4444-4444-8444-444444444444'),('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-4444-4444-8444-444444444444');
insert into public.microsoft_todo_tasks values ('aaaaaaaa-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',null),('bbbbbbbb-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',null);
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ begin
 if (select count(*) from public.search_experience_library_v2('报名截止')) <> 1 then raise exception 'OCR search failed'; end if;
 if (select match_excerpt from public.search_experience_library_v2('报名截止')) not like '%报名截止%' then raise exception 'OCR excerpt failed'; end if;
 if (select count(*) from public.search_experience_library_v2('秘密截图')) <> 0 then raise exception 'foreign OCR leaked'; end if;
end $$;
select public.save_experience_ocr_correction('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444444',repeat('a',64),'修正后的关键词十一月',null,null);
do $$ begin
 begin
  perform public.save_experience_ocr_correction('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444444',repeat('a',64),'并发旧编辑',null,null);
  raise exception 'stale correction accepted';
 exception when others then if sqlerrm <> 'ocr_correction_conflict' then raise; end if; end;
end $$;
insert into public.experience_library_task_links(user_id,entry_id,todo_task_id) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-5555-4555-8555-555555555555');
do $$ begin
 if (select count(*) from public.search_experience_library_v2('十一月')) <> 1 then raise exception 'corrected OCR search failed'; end if;
 if (select count(*) from public.search_experience_library_v2('报名截止')) <> 0 then raise exception 'obsolete OCR still searchable'; end if;
 begin
  insert into public.experience_library_ocr_corrections(user_id,media_id,document_id,source_sha256,text_content) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-2222-4222-8222-222222222222','bbbbbbbb-4444-4444-8444-444444444444',repeat('a',64),'wrong');
  raise exception 'foreign document accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.experience_library_task_links(user_id,entry_id,todo_task_id) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-5555-4555-8555-555555555555');
  raise exception 'foreign task accepted';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
 if (select count(*) from public.experience_library_ocr_corrections) <> 0 then raise exception 'correction leaked'; end if;
 if (select count(*) from public.experience_library_task_links) <> 0 then raise exception 'task link leaked'; end if;
 if (select count(*) from public.search_experience_library_v2('十一月')) <> 0 then raise exception 'foreign corrected OCR leaked'; end if;
end $$;
rollback;
