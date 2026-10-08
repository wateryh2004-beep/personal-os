create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.documents(id uuid primary key,user_id uuid not null,storage_state text not null,archived_at timestamptz);
create table public.search_documents(user_id uuid,entity_type text,entity_id uuid,primary key(user_id,entity_type,entity_id));
create function public.synthetic_search_sync() returns trigger language plpgsql as $$ begin
 if tg_op='DELETE' then return old; end if;
 insert into search_documents values(new.user_id,'document',new.id) on conflict do nothing; return new;
end $$;
create trigger search_documents after insert or update on documents for each row execute function synthetic_search_sync();
alter table documents enable row level security; alter table search_documents enable row level security;
create policy own on documents for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own on search_documents for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant all on documents,search_documents to authenticated;
