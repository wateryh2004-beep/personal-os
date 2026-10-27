-- Actual transactions, RLS, minimum ACL and full-content/token CAS. Synthetic only.
begin;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$
declare item uuid:='b2100000-0000-4000-8000-000000000001'; token uuid:='b2100000-0000-4000-8000-000000000011'; newer uuid:='b2100000-0000-4000-8000-000000000012'; result jsonb; proposal jsonb;
begin
 result:=public.capture_inbox_intent(item,'Synthetic unchanged capture');assert result->>'created'='true';
 result:=public.capture_inbox_intent(item,'Synthetic unchanged capture');assert result->>'created'='false';
 assert(select count(*)=1 from public.inbox_items where id=item);
 assert(select count(*)=1 from public.audit_logs where entity_id=item and action='capture');
 begin perform public.capture_inbox_intent(item,'Changed payload');raise exception 'TEST conflicting capture accepted';exception when serialization_failure then null;end;
 begin perform public.capture_inbox_intent('b2100000-0000-4000-8000-000000000002',repeat('🌱',5001));raise exception 'TEST UTF16 capture budget exceeded';exception when invalid_parameter_value then null;end;
 begin update public.inbox_items set capture_content_hash=repeat('a',64) where id=item;raise exception 'TEST provenance changed directly';exception when insufficient_privilege then null;end;
 assert public.claim_inbox_classification(item,token,'Synthetic unchanged capture',false);
 assert not public.claim_inbox_classification(item,newer,'Synthetic unchanged capture',false);
 for proposal in select value from jsonb_array_elements('[
  {},{"target":"unknown"},{"target":"daily","body":"forged"},
  {"target":"note","title":"Missing body"},{"target":"note","title":3,"bodyMarkdown":""},{"target":"note","title":" ","bodyMarkdown":""},
  {"target":"task","todoListId":"invalid","title":"Task","bodyText":null,"importance":"normal","dueAt":null},
  {"target":"task","todoListId":"83000000-0000-4000-8000-000000000001","title":"Task","bodyText":null,"importance":"invalid","dueAt":null},
  {"target":"calendar","subject":"Event","description":null,"startsAt":"2026-10-27T09:00:00Z","endsAt":"2026-10-27T08:00:00Z","locationName":null,"isAllDay":false},
  {"target":"calendar","subject":"Event","description":null,"startsAt":"2026-02-30T09:00:00Z","endsAt":"2026-03-01T10:00:00Z","locationName":null,"isAllDay":false},
  {"target":"calendar","subject":"Event","description":null,"startsAt":"2026-10-27T24:00:00Z","endsAt":"2026-10-28T10:00:00Z","locationName":null,"isAllDay":false},
  {"target":"calendar","subject":"Event","description":null,"startsAt":"2026-10-27T09:00:00+0800","endsAt":"2026-10-27T10:00:00+0800","locationName":null,"isAllDay":false},
  {"target":"calendar","subject":"Event","description":null,"startsAt":"2026-10-27T09:00Z","endsAt":"2026-10-27T10:00Z","locationName":null,"isAllDay":"false"}
 ]'::jsonb) loop
  begin perform public.commit_inbox_classification(item,token,'Synthetic unchanged capture',proposal,null);raise exception 'TEST invalid proposal accepted';exception when invalid_parameter_value then null;end;
 end loop;
 assert not public.commit_inbox_classification(item,newer,'Synthetic unchanged capture','{"target":"daily"}',null);
 assert not public.commit_inbox_classification(item,token,'Changed content','{"target":"daily"}',null);
 assert public.claim_inbox_classification(item,newer,'Synthetic unchanged capture',true);
 assert not public.commit_inbox_classification(item,token,'Synthetic unchanged capture','{"target":"daily"}',null);
 assert public.commit_inbox_classification(item,newer,'Synthetic unchanged capture','{"target":"calendar","subject":"Event","description":null,"startsAt":"2026-10-27T09:00Z","endsAt":"2026-10-27T10:00Z","locationName":null,"isAllDay":false}',null);
 assert(select ai_status='ready' and ai_classification_token is null and ai_classification_started_at is null and ai_classification_content_hash is null from public.inbox_items where id=item);
 assert not public.commit_inbox_classification(item,newer,'Synthetic unchanged capture','{"target":"daily"}',null);
 assert public.claim_inbox_classification(item,token,'Synthetic unchanged capture',true);
 update public.inbox_items set content_markdown='User edited capture' where id=item;
 assert not public.commit_inbox_classification(item,token,'Synthetic unchanged capture','{"target":"daily"}',null);
 assert(select content_markdown='User edited capture' and ai_classification_token is null from public.inbox_items where id=item);
 assert public.claim_inbox_classification(item,newer,'User edited capture',true);
 update public.inbox_items set processed_at=now() where id=item;
 assert not public.commit_inbox_classification(item,newer,'User edited capture','{"target":"daily"}',null);
 assert not public.claim_inbox_classification(item,token,'User edited capture',true);
 begin delete from public.inbox_items where id=item;raise exception 'TEST provenance capture permanently deleted';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
do $$begin
 assert not exists(select 1 from public.inbox_items where id='b2100000-0000-4000-8000-000000000001');
 assert not public.claim_inbox_classification('b2100000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000011','User edited capture',true);
 begin perform public.capture_inbox_intent('b2100000-0000-4000-8000-000000000001','Synthetic unchanged capture');raise exception 'TEST cross-owner capture replay';exception when serialization_failure then null;end;
end $$;
reset role;
do $$begin
 assert not has_function_privilege('anon','public.capture_inbox_intent(uuid,text)','EXECUTE');
 assert not has_function_privilege('anon','public.claim_inbox_classification(uuid,uuid,text,boolean)','EXECUTE');
 assert not has_function_privilege('anon','public.commit_inbox_classification(uuid,uuid,text,jsonb,text)','EXECUTE');
 assert not has_function_privilege('authenticated','private.inbox_ai_dispatch_free(uuid,uuid)','EXECUTE');
end $$;
create function public.synthetic_capture_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_capture_audit_failure';end $$;
create trigger synthetic_capture_audit_failure before insert on public.audit_logs for each row when(new.action='capture') execute function public.synthetic_capture_audit_failure();
set local role authenticated;set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$begin
 begin perform public.capture_inbox_intent('b2100000-0000-4000-8000-000000000003','Atomic failed capture');raise exception 'TEST audit failed capture accepted';exception when raise_exception then if sqlerrm<>'synthetic_capture_audit_failure' then raise;end if;end;
 assert not exists(select 1 from public.inbox_items where id='b2100000-0000-4000-8000-000000000003');
end $$;
rollback;
