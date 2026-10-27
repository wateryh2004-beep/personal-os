-- Shared by the known-legacy upgrade and exact metadata-gap installation paths.
-- Synthetic owner only; caller owns the transaction and rolls every write back.
reset role;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$declare v_first jsonb;v_second jsonb;v_review uuid;begin
 v_first:=public.complete_review_with_sources('daily','compat:atomic:audit','Atomic original','2026-10-27','2026-10-27',E'  Atomic original\n','{"freeReflection":"Original"}',false,
  '[{"sourceType":"project","sourceId":"85000000-0000-4000-8000-000000000001","sourceRole":"cited"}]');
 v_review:=(v_first->>'review_id')::uuid;
 v_second:=public.complete_review_with_sources('daily','compat:atomic:audit','Atomic amended','2026-10-27','2026-10-27',E'  Atomic amended\n','{"freeReflection":"Amended"}',true,
  '[{"sourceType":"project","sourceId":"85000000-0000-4000-8000-000000000001","sourceRole":"cited"}]');
 assert(v_second->>'review_id')::uuid=v_review;
 assert(v_first->>'version_number')::integer=1 and(v_second->>'version_number')::integer=2;
 assert(select count(*)=2 from public.audit_logs where entity_type='review' and entity_id=v_review);
 assert(select count(*)=1 from public.audit_logs where entity_id=v_review and action='review_complete' and actor_type='user' and user_id=auth.uid()
  and after_data='{"review_type":"daily","period":"compat:atomic:audit","source_count":1,"generated_with_ai":false}'::jsonb);
 assert(select count(*)=1 from public.audit_logs where entity_id=v_review and action='review_amend' and actor_type='user' and user_id=auth.uid()
  and after_data='{"review_type":"daily","period":"compat:atomic:audit","source_count":1,"generated_with_ai":true}'::jsonb);
 assert(select reason='completed' and content_markdown=E'  Atomic original\n' from public.review_versions where review_id=v_review and version_number=1);
 assert(select reason='amended' and content_markdown=E'  Atomic amended\n' from public.review_versions where review_id=v_review and version_number=2);
end $$;
reset role;
create function public.synthetic_compat_completion_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_compat_completion_audit_failure';end $$;
create trigger synthetic_compat_completion_audit_failure before insert on public.audit_logs for each row when(new.action in('review_complete','review_amend')) execute function public.synthetic_compat_completion_audit_failure();
set local role authenticated;
do $$declare v_review uuid;v_before jsonb;v_after jsonb;v_key text;begin
 select id into v_review from public.reviews where user_id=auth.uid() and review_key='compat:atomic:audit';
 select jsonb_build_object('review',(select to_jsonb(r) from public.reviews r where id=v_review),
  'versions',(select jsonb_agg(to_jsonb(v) order by version_number) from public.review_versions v where review_id=v_review),
  'sources',(select jsonb_agg(to_jsonb(s) order by id) from public.review_sources s where review_id=v_review),
  'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where entity_id=v_review)) into v_before;
 foreach v_key in array array['compat:atomic:audit-rejected','compat:atomic:audit'] loop
  begin
   perform public.complete_review_with_sources('daily',v_key,'Must not commit','2026-10-27','2026-10-27','Must roll back','{"freeReflection":"Rejected"}',false,'[]');
   raise exception 'TEST completion audit failure ignored';
  exception when raise_exception then if sqlerrm<>'synthetic_compat_completion_audit_failure' then raise;end if;end;
  assert not exists(select 1 from public.reviews where user_id=auth.uid() and review_key='compat:atomic:audit-rejected');
  select jsonb_build_object('review',(select to_jsonb(r) from public.reviews r where id=v_review),
   'versions',(select jsonb_agg(to_jsonb(v) order by version_number) from public.review_versions v where review_id=v_review),
   'sources',(select jsonb_agg(to_jsonb(s) order by id) from public.review_sources s where review_id=v_review),
   'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where entity_id=v_review)) into v_after;
  assert v_after=v_before,'completion audit failure left partial review/version/source/audit writes';
 end loop;
end $$;
reset role;
drop trigger synthetic_compat_completion_audit_failure on public.audit_logs;
drop function public.synthetic_compat_completion_audit_failure();
create function public.synthetic_compat_atomic_version_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_compat_atomic_version_failure';end $$;
create trigger synthetic_compat_atomic_version_failure before insert on public.review_versions for each row execute function public.synthetic_compat_atomic_version_failure();
set local role authenticated;
do $$declare v_review uuid;v_before jsonb;v_after jsonb;begin
 select id into v_review from public.reviews where user_id=auth.uid() and review_key='compat:atomic:audit';
 select jsonb_build_object('review',(select to_jsonb(r) from public.reviews r where id=v_review),
  'versions',(select jsonb_agg(to_jsonb(v) order by version_number) from public.review_versions v where review_id=v_review),
  'sources',(select jsonb_agg(to_jsonb(s) order by id) from public.review_sources s where review_id=v_review),
  'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where entity_id=v_review)) into v_before;
 begin
  perform public.complete_review_with_sources('daily','compat:atomic:audit','Must not commit','2026-10-27','2026-10-27','Must roll back','{}',false,'[]');
  raise exception 'TEST completion version failure ignored';
 exception when raise_exception then if sqlerrm<>'synthetic_compat_atomic_version_failure' then raise;end if;end;
 select jsonb_build_object('review',(select to_jsonb(r) from public.reviews r where id=v_review),
  'versions',(select jsonb_agg(to_jsonb(v) order by version_number) from public.review_versions v where review_id=v_review),
  'sources',(select jsonb_agg(to_jsonb(s) order by id) from public.review_sources s where review_id=v_review),
  'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where entity_id=v_review)) into v_after;
 assert v_after=v_before,'completion version failure left partial review/version/source/audit writes';
end $$;
reset role;
drop trigger synthetic_compat_atomic_version_failure on public.review_versions;
drop function public.synthetic_compat_atomic_version_failure();
