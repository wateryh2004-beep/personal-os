\set ON_ERROR_STOP on
-- Synthetic, standalone PostgreSQL only. Never point this at Supabase/production.
do $$ begin
  if current_database() <> 'pdf_cover_test' then raise exception 'requires isolated pdf_cover_test database'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
create table auth.users (id uuid primary key);
create table public.documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  storage_path text not null,
  storage_bucket text not null,
  storage_provider text not null default 'cloudflare_r2',
  storage_state text not null default 'available',
  file_size bigint not null,
  checksum text,
  mime_type text not null default 'application/pdf',
  original_filename text not null default 'fixture.pdf',
  title text not null default 'Synthetic fixture',
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.documents enable row level security;
create policy documents_owner on public.documents for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.documents to authenticated;
grant all on public.documents, auth.users to service_role;
grant usage on schema public to anon, authenticated, service_role;
