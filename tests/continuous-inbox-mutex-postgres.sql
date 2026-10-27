-- Actual PostgreSQL only; every fixture is synthetic and rolls back.
begin;
insert into auth.users(id) values('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002');
insert into public.calendar_connections(id,user_id,label) values('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Synthetic');
insert into public.microsoft_todo_lists(id,user_id,connection_id,provider_list_id,display_name) values('d5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','synthetic-list','Synthetic');
insert into public.microsoft_todo_tasks(id,user_id,todo_list_id,provider_task_id,title) values
 ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','synthetic-legacy','Legacy provider result'),
 ('d6000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','synthetic-other','Different actual task');
insert into public.inbox_items(id,user_id,content_markdown)
select ('d3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d1000000-0000-4000-8000-000000000001','Synthetic Inbox '||n from generate_series(1,12)n;
insert into public.inbox_items(id,user_id,content_markdown) values('d3000000-0000-4000-8000-000000000013','d1000000-0000-4000-8000-000000000002','Foreign source');
insert into public.notes(id,user_id,title,body_markdown,status,revision) values('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','日记 · 2026-10-27',E'# 日记\n\n## 感受与想法\n\n## 明天\n','active',1);
-- Service executor uses ACL and explicit owner; auth.uid is deliberately empty.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',repeat('a',64));
select public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002',repeat('b',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000002"}');
select public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000007',repeat('a',64));
select public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000008',repeat('a',64));
update public.todo_creation_receipts set status='remote_committed',task_id='d6000000-0000-4000-8000-000000000001' where inbox_id in('d3000000-0000-4000-8000-000000000007','d3000000-0000-4000-8000-000000000008');
select public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000009',repeat('a',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000009"}');
select public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000011',repeat('a',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000011"}');
update public.calendar_operations set status='succeeded',provider_event_id='synthetic-provider-result' where id in('d3000000-0000-4000-8000-000000000009','d3000000-0000-4000-8000-000000000011');
-- A protected service may complete an actual matching receipt with auth.uid null.
update public.inbox_items set converted_todo_task_id='d6000000-0000-4000-8000-000000000001',processed_at=now() where id='d3000000-0000-4000-8000-000000000008';
update public.inbox_items set processed_at=now() where id='d3000000-0000-4000-8000-000000000011';
do $$begin
 begin perform public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',repeat('b',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000001"}');raise exception 'TEST competing external intent accepted';exception when serialization_failure then null;end;
 begin perform public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001',repeat('a',64));raise exception 'TEST foreign service source accepted';exception when insufficient_privilege then null;end;
 update public.todo_creation_receipts set status='processing' where inbox_id='d3000000-0000-4000-8000-000000000001';
 update public.todo_creation_receipts set status='unknown' where inbox_id='d3000000-0000-4000-8000-000000000001';
 assert not public.cancel_inbox_undispatched('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001');
 begin perform public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',repeat('c',64));raise exception 'TEST unknown intent replaced';exception when serialization_failure then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$begin
 -- Raw owner UPDATE cannot fake completion around a new active/unknown claim.
 begin update public.inbox_items set processed_at=now() where id='d3000000-0000-4000-8000-000000000001';raise exception 'TEST unknown task forged processed_at';exception when serialization_failure then null;end;
 begin update public.inbox_items set processed_at=now(),converted_todo_task_id='d6000000-0000-4000-8000-000000000001' where id='d3000000-0000-4000-8000-000000000001';raise exception 'TEST unknown task forged actual unrelated task';exception when serialization_failure then null;end;
 begin update public.inbox_items set id='d3000000-0000-4000-8000-000000000099' where id='d3000000-0000-4000-8000-000000000001';raise exception 'TEST claimed source identity changed';exception when serialization_failure then null;end;
 begin update public.inbox_items set processed_at=now() where id='d3000000-0000-4000-8000-000000000002';raise exception 'TEST pending calendar forged processed_at';exception when serialization_failure then null;end;
 begin update public.inbox_items set converted_todo_task_id='d6000000-0000-4000-8000-000000000001',processed_at=now() where id='d3000000-0000-4000-8000-000000000002';raise exception 'TEST calendar claim switched to task';exception when serialization_failure then null;end;
 begin update public.inbox_items set converted_todo_task_id='d6000000-0000-4000-8000-000000000002',processed_at=now() where id='d3000000-0000-4000-8000-000000000007';raise exception 'TEST different owned task substituted for matching receipt';exception when serialization_failure then null;end;
 assert not public.finish_inbox_target('d3000000-0000-4000-8000-000000000002','calendar','d3000000-0000-4000-8000-000000000009');
 assert public.finish_inbox_target('d3000000-0000-4000-8000-000000000007','task','d6000000-0000-4000-8000-000000000001');
 assert public.finish_inbox_target('d3000000-0000-4000-8000-000000000009','calendar','d3000000-0000-4000-8000-000000000009');
 begin update public.inbox_items set processed_at=null,converted_todo_task_id=null where id='d3000000-0000-4000-8000-000000000007';raise exception 'TEST active receipt target erased';exception when serialization_failure then null;end;
 assert(select processed_at is null and converted_todo_task_id is null from public.inbox_items where id='d3000000-0000-4000-8000-000000000001');
 assert(select processed_at is null and converted_todo_task_id is null from public.inbox_items where id='d3000000-0000-4000-8000-000000000002');
 assert(select processed_at is not null from public.inbox_items where id='d3000000-0000-4000-8000-000000000008');
 assert(select processed_at is not null from public.inbox_items where id='d3000000-0000-4000-8000-000000000011');
end $$;
do $$begin
 begin perform public.convert_inbox_note('d3000000-0000-4000-8000-000000000001','Must roll back','body');raise exception 'TEST note bypassed unknown task';exception when serialization_failure then null;end;
 assert not exists(select 1 from public.notes where title='Must roll back');
 begin perform public.convert_inbox_daily('d3000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001',1);raise exception 'TEST daily bypassed calendar';exception when serialization_failure then null;end;
 assert (select revision=1 and body_markdown not like '%inbox:%' from public.notes where id='d4000000-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.note_versions where note_id='d4000000-0000-4000-8000-000000000001');
 perform public.convert_inbox_note('d3000000-0000-4000-8000-000000000003','Note first','body');
 begin insert into public.calendar_operations(user_id,connection_id,operation_type,request_id,request_hash,payload) values(auth.uid(),'d2000000-0000-4000-8000-000000000001','create',gen_random_uuid(),repeat('a',64),'{"sourceInboxId":"d3000000-0000-4000-8000-000000000013"}');raise exception 'TEST foreign calendar source accepted';exception when insufficient_privilege then null;end;
 begin perform public.prepare_inbox_todo_creation(auth.uid(),'d3000000-0000-4000-8000-000000000004',repeat('a',64));raise exception 'TEST browser prepared service receipt';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003',repeat('a',64));raise exception 'TEST task after note accepted';exception when serialization_failure then null;end;
 assert public.cancel_inbox_undispatched('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
 perform public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002',repeat('c',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000002","subject":"Explicit new confirmation"}');
 assert (select request_hash=repeat('c',64) and status='pending_confirmation' from public.calendar_operations where id='d3000000-0000-4000-8000-000000000002');
 update public.calendar_operations set status='processing',claimed_at=now() where id='d3000000-0000-4000-8000-000000000002';
 update public.calendar_operations set status='failed',result='{"writeOutcome":"not_written"}' where id='d3000000-0000-4000-8000-000000000002';
 perform public.prepare_inbox_calendar_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002',repeat('d',64),'d2000000-0000-4000-8000-000000000001','{"sourceInboxId":"d3000000-0000-4000-8000-000000000002","subject":"After rejection"}');
 assert public.cancel_inbox_undispatched('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
 perform public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004',repeat('a',64));
 update public.todo_creation_receipts set status='processing' where inbox_id='d3000000-0000-4000-8000-000000000004';
 update public.todo_creation_receipts set status='rejected' where inbox_id='d3000000-0000-4000-8000-000000000004';
 perform public.prepare_inbox_todo_creation('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004',repeat('b',64));
 assert (select status='prepared' and request_hash=repeat('b',64) from public.todo_creation_receipts where inbox_id='d3000000-0000-4000-8000-000000000004');
 assert public.cancel_inbox_undispatched('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$declare destination jsonb;begin
 destination:=public.convert_inbox_daily('d3000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001',1);
 assert destination->>'date'='2026-10-27';
 assert (select revision=2 and strpos(body_markdown,'Synthetic Inbox 2')>0 from public.notes where id='d4000000-0000-4000-8000-000000000001');
 assert public.convert_inbox_daily('d3000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001',0)=destination;
 assert (select count(*)=1 from public.note_versions where note_id='d4000000-0000-4000-8000-000000000001');
 perform public.convert_inbox_note('d3000000-0000-4000-8000-000000000004','After safe task cancellation','kept input');
end $$;
-- Audit failure must roll back source, daily content and preserved version.
reset role;
create function public.synthetic_inbox_daily_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_daily_audit_failure';end $$;
create trigger synthetic_inbox_daily_audit_failure before insert on public.audit_logs for each row when(new.action='append_inbox') execute function public.synthetic_inbox_daily_audit_failure();
set local role authenticated;
do $$begin
 begin perform public.convert_inbox_daily('d3000000-0000-4000-8000-000000000006','d4000000-0000-4000-8000-000000000001',2);raise exception 'TEST audit failure committed';exception when raise_exception then if sqlerrm<>'synthetic_daily_audit_failure' then raise;end if;end;
 assert(select processed_at is null and converted_note_id is null from public.inbox_items where id='d3000000-0000-4000-8000-000000000006');
 assert(select revision=2 and strpos(body_markdown,'inbox:d3000000-0000-4000-8000-000000000006')=0 from public.notes where id='d4000000-0000-4000-8000-000000000001');
 assert(select count(*)=1 from public.note_versions where note_id='d4000000-0000-4000-8000-000000000001');
end $$;
reset role;
drop trigger synthetic_inbox_daily_audit_failure on public.audit_logs;
set local role authenticated;
-- Legacy a580 direct source finishes do not require a newly invented receipt.
-- A historical calendar draft without sourceInboxId stays unassociated; the
-- migration must neither infer an Inbox owner nor dispatch/replay that draft.
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
update public.inbox_items set converted_todo_task_id='d6000000-0000-4000-8000-000000000001',processed_at=now() where id='d3000000-0000-4000-8000-000000000005';
insert into public.calendar_operations(id,user_id,connection_id,operation_type,status,payload) values('d7000000-0000-4000-8000-000000000001',auth.uid(),'d2000000-0000-4000-8000-000000000001','create','pending_confirmation','{"subject":"Legacy draft"}');
update public.calendar_operations set status='queued' where id='d7000000-0000-4000-8000-000000000001';
update public.calendar_operations set status='cancelled' where id='d7000000-0000-4000-8000-000000000001';
do $$begin
 assert(select converted_todo_task_id='d6000000-0000-4000-8000-000000000001' and processed_at is not null from public.inbox_items where id='d3000000-0000-4000-8000-000000000005');
 assert not exists(select 1 from public.todo_creation_receipts where inbox_id='d3000000-0000-4000-8000-000000000005');
 assert(select payload->>'sourceInboxId' is null and status='cancelled' from public.calendar_operations where id='d7000000-0000-4000-8000-000000000001');
 begin delete from public.inbox_items where id='d3000000-0000-4000-8000-000000000001';raise exception 'TEST claimed source deleted';exception when raise_exception then if sqlerrm<>'inbox_dispatch_source_retained' then raise;end if;end;
end $$;
-- Anonymous and foreign users cannot create service proofs or inspect receipts.
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$begin
 assert not exists(select 1 from public.todo_creation_receipts where inbox_id='d3000000-0000-4000-8000-000000000001');
 begin perform public.convert_inbox_daily('d3000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001',2);raise exception 'TEST foreign daily accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.cancel_inbox_undispatched('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001');raise exception 'TEST anonymous cancel accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
