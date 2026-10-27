
-- AFTER
create temp table compat_after_definitions as
 select 'function:'||p.oid::regprocedure::text object_name,md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,'')||p.proowner::text) fingerprint
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and p.prokind in('f','p')
 union all select 'trigger:'||t.tgrelid::regclass::text||':'||t.tgname,md5(pg_get_triggerdef(t.oid)||t.tgenabled::text)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and not t.tgisinternal;
do $$begin
 -- The exact known legacy completion is the sole expected forward upgrade.
 -- All other functions, procedures, triggers, grants, configuration and owners stay exact.
 assert not exists(
  (select * from compat_existing_definitions where object_name<>(select object_name from compat_completion_before)
   except select * from compat_after_definitions where object_name<>(select object_name from compat_completion_before))
  union all
  (select * from compat_after_definitions where object_name<>(select object_name from compat_completion_before)
   except select * from compat_existing_definitions where object_name<>(select object_name from compat_completion_before))
 ),'unrelated legitimate definitions or grants changed';
 assert exists(select 1 from pg_proc p join compat_completion_before prior on p.oid=prior.oid
  where md5(p.prosrc)='01d9d71c10f6e5eaae96beed1dd9f685' and p.proconfig=array['search_path=""']::text[]
   and p.proacl::text=prior.acl and p.proowner=prior.proowner and not p.prosecdef), 'completion atomic upgrade or preserved ACL/owner mismatch';
 if(select source_md5='01d9d71c10f6e5eaae96beed1dd9f685' from compat_completion_before) then
  assert not exists((select * from compat_existing_definitions except select * from compat_after_definitions)
   union all(select * from compat_after_definitions except select * from compat_existing_definitions)), 'already atomic completion changed';
 else
  assert(select source_md5='72426d437364e96e3596d8c9c0424215' from compat_completion_before), 'unrecognized legacy completion control';
  assert(select fingerprint<>(select fingerprint from compat_after_definitions where object_name=prior.object_name)
   from compat_existing_definitions prior where object_name=(select object_name from compat_completion_before)), 'legacy completion was not upgraded';
 end if;
 assert(select fingerprint=(select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.search_documents s) from compat_existing_projection), 'existing legitimate projection changed';
end $$;
