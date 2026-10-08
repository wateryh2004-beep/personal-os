-- Isolated synthetic schema only; never run against an application database.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
create table public.file_folders(id uuid primary key,user_id uuid not null references auth.users,archived_at timestamptz);
grant all on public.file_folders to service_role;
create table public.documents(
 id uuid primary key,user_id uuid not null references auth.users, storage_path text not null,
 storage_bucket text not null default 'private-test', storage_provider text not null default 'cloudflare_r2',
 storage_state text not null default 'available',checksum text,file_size bigint not null default 100,
 uploaded_at timestamptz not null default now(),
 title text not null default 'Synthetic',document_type text not null default 'other',folder_id uuid references public.file_folders,text_extraction_status text not null default 'pending',
 mime_type text not null default 'application/pdf',original_filename text not null default 'synthetic.pdf',archived_at timestamptz
);
alter table public.documents enable row level security;
create policy documents_owner on public.documents to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.documents to authenticated;
grant all on public.documents,auth.users to service_role;

create table public.audit_logs(id uuid primary key default gen_random_uuid(),user_id uuid,action text,entity_type text,entity_id uuid,actor_type text,after_data jsonb);
grant all on public.audit_logs to service_role;
