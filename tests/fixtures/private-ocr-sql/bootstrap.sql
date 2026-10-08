-- Isolated synthetic test database only.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table auth.users(id uuid primary key);
create table public.documents(
 id uuid primary key,user_id uuid not null references auth.users(id),storage_path text not null,storage_bucket text not null,
 storage_provider text not null default 'cloudflare_r2',storage_state text not null default 'available',file_size bigint not null,
 checksum text,mime_type text not null default 'application/pdf',original_filename text not null default 'scan.pdf',
 title text not null default 'scan',text_extraction_status text not null default 'failed',extracted_text text,
 extracted_character_count integer not null default 0,text_extraction_error_code text,text_extracted_at timestamptz,
 updated_at timestamptz not null default now(),archived_at timestamptz
);
alter table public.documents enable row level security;
create policy owner_documents on public.documents for select to authenticated using(user_id=auth.uid());
grant select on public.documents to authenticated;
create table public.audit_logs(user_id uuid,action text,entity_type text,entity_id uuid,actor_type text,after_data jsonb);
create table public.search_documents(user_id uuid,domain text,entity_type text,entity_id uuid,title text,subtitle text,content_text text,metadata jsonb,source_updated_at timestamptz,updated_at timestamptz default now(),unique(user_id,entity_type,entity_id));
alter table public.search_documents enable row level security;
create policy owner_search on public.search_documents for select to authenticated using(user_id=auth.uid());
grant select on public.search_documents to authenticated;
