-- ONLY for the isolated disposable CI PostgreSQL database, never Supabase/production.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
-- Mirror Supabase default function grants so explicit helper boundaries are tested.
alter default privileges in schema public grant execute on functions to anon, authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.audit_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),action text not null,entity_type text not null,entity_id uuid,actor_type text not null,after_data jsonb,created_at timestamptz default now());
alter table public.audit_logs enable row level security;
grant select,insert on public.audit_logs to authenticated;
create policy audit_owner_read on public.audit_logs for select to authenticated using(auth.uid()=user_id);
create policy audit_owner_insert on public.audit_logs for insert to authenticated with check(auth.uid()=user_id);
insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
