-- Disposable PostgreSQL only: before/after parts run with actual migration in one transaction.
-- BEFORE
create temp table compat_existing_definitions as
 select 'function:'||p.oid::regprocedure::text object_name,md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,'')||p.proowner::text) fingerprint
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and p.prokind in('f','p')
 union all select 'trigger:'||t.tgrelid::regclass::text||':'||t.tgname,md5(pg_get_triggerdef(t.oid)||t.tgenabled::text)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and not t.tgisinternal;
create temp table compat_completion_before as
 select 'function:'||p.oid::regprocedure::text object_name,p.oid,md5(p.prosrc) source_md5,p.proconfig,p.proacl::text acl,p.proowner
 from pg_proc p where p.oid='public.complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)'::regprocedure;
create temp table compat_existing_projection as select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) fingerprint from public.search_documents s;
do $$begin
 assert(select (source_md5='72426d437364e96e3596d8c9c0424215' and proconfig=array['search_path=public']::text[]) or (source_md5='01d9d71c10f6e5eaae96beed1dd9f685' and proconfig=array['search_path=""']::text[]) from compat_completion_before),'unexpected completion control definition';
 assert(select count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('review_source_is_owned','complete_review_with_sources','accept_review_proposal','dismiss_review_proposal','sync_project_search_document'));
 assert exists(select 1 from pg_trigger where tgrelid='public.projects'::regclass and tgname='projects_search_sync');
end $$;
