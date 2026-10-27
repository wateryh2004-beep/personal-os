alter table public.todo_creation_receipts drop constraint todo_creation_receipts_status_check;
alter table public.todo_creation_receipts add constraint todo_creation_receipts_status_check check(status in('prepared','processing','remote_committed','available','unknown','rejected','cancelled'));

-- One Inbox row is the transaction mutex for its finite destinations. No lock
-- spans HTTP: a committed provider receipt/draft reserves the source until its
-- authoritative result is reconciled. Unknown outcomes never release it.
create index calendar_inbox_intent on public.calendar_operations(user_id,(payload->>'sourceInboxId'))
 where operation_type='create' and payload->>'sourceInboxId' is not null;

create function private.guard_todo_inbox_intent() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.inbox_items%rowtype; r public.todo_creation_receipts%rowtype;
begin
 if tg_op='UPDATE' and (row(new.user_id,new.request_id,new.inbox_id) is distinct from row(old.user_id,old.request_id,old.inbox_id) or (new.request_hash<>old.request_hash and not(old.status in('rejected','cancelled') and new.status='prepared' and old.task_id is null))) then
  raise exception 'inbox_request_conflict' using errcode='40001';
 end if;
 if tg_op='UPDATE' then
  if old.status not in('rejected','cancelled') and new.status='prepared' and old.status<>'prepared' then raise exception 'inbox_remote_result_unresolved' using errcode='40001';end if;
  if new.status is distinct from old.status then
   insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(new.user_id,'dispatch_state','todo_creation_receipt',new.id,'user',jsonb_build_object('previous_status',old.status,'status',new.status,'request_hash',new.request_hash,'task_id',new.task_id));
  end if;
  -- The committed receipt already holds the source. Avoid reversing the lock
  -- order during dispatch CAS; only a safe new intent needs a new Inbox claim.
  if not(old.status in('rejected','cancelled') and new.status='prepared') then return new;end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(new.user_id,'reprepare','todo_creation_receipt',new.id,'user',jsonb_build_object('previous_hash',old.request_hash,'request_hash',new.request_hash));
 end if;
 if new.inbox_id is null then return new;end if;
 select * into i from public.inbox_items where id=new.inbox_id and user_id=new.user_id for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 if new.request_id<>new.inbox_id then raise exception 'inbox_request_conflict' using errcode='40001';end if;
 -- INSERT ON CONFLICT still fires BEFORE INSERT. An identical receipt retry is
 -- allowed after source completion, but cannot replace its payload or identity.
 if tg_op='INSERT' then
  select * into r from public.todo_creation_receipts where user_id=new.user_id and inbox_id=new.inbox_id;
  if found then
   if r.request_id<>new.request_id or (r.request_hash<>new.request_hash and r.status not in('rejected','cancelled')) then raise exception 'inbox_request_conflict' using errcode='40001';end if;
   return new;
  end if;
 end if;
 if i.converted_note_id is not null or i.converted_task_id is not null or (i.processed_at is not null and (new.task_id is null or i.converted_todo_task_id is distinct from new.task_id)) or (i.converted_todo_task_id is not null and i.converted_todo_task_id is distinct from new.task_id) then
  raise exception 'inbox_destination_conflict' using errcode='40001';
 end if;
 if tg_op='INSERT' and i.archived_at is not null then raise exception 'inbox_unavailable' using errcode='42501';end if;
 if exists(select 1 from public.calendar_operations c where c.user_id=new.user_id and c.operation_type='create' and c.payload->>'sourceInboxId'=i.id::text
  and not(((c.status='cancelled' and c.claimed_at is null) or (c.status='failed' and coalesce(c.result->>'writeOutcome'='not_written',false))) and c.provider_event_id is null and c.remote_committed_at is null and c.cache_committed_at is null)) then
  raise exception 'inbox_destination_conflict' using errcode='40001';
 end if;
 return new;
end $$;
revoke all on function private.guard_todo_inbox_intent() from public,anon,authenticated,service_role;
create trigger todo_inbox_intent before insert or update on public.todo_creation_receipts for each row execute function private.guard_todo_inbox_intent();

create function private.guard_calendar_inbox_intent() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare source uuid; i public.inbox_items%rowtype; existing public.calendar_operations%rowtype; safe_restart boolean:=false;
begin
 if tg_op='UPDATE' and old.payload->>'sourceInboxId' is not null then
  safe_restart:=auth.role()='service_role' and new.status='pending_confirmation'
   and ((old.status='cancelled' and old.claimed_at is null) or (old.status='failed' and coalesce(old.result->>'writeOutcome'='not_written',false)))
   and old.provider_event_id is null and old.remote_committed_at is null and old.cache_committed_at is null;
  if safe_restart and row(new.user_id,new.operation_type,new.request_id,new.payload->>'sourceInboxId') is distinct from row(old.user_id,old.operation_type,old.request_id,old.payload->>'sourceInboxId') then raise exception 'inbox_request_conflict' using errcode='40001';end if;
  if not safe_restart and row(new.user_id,new.operation_type,new.request_id,new.request_hash,new.payload) is distinct from row(old.user_id,old.operation_type,old.request_id,old.request_hash,old.payload) then
   raise exception 'inbox_request_conflict' using errcode='40001';
  end if;
  if new.status='cancelled' and (old.status not in('pending_confirmation','queued') or old.claimed_at is not null or old.provider_event_id is not null or old.remote_committed_at is not null or old.cache_committed_at is not null) then
   raise exception 'inbox_remote_result_unresolved' using errcode='40001';
  end if;
  if not safe_restart and new.status in('pending_confirmation','queued') and old.status not in('pending_confirmation','queued') then raise exception 'inbox_remote_result_unresolved' using errcode='40001';end if;
  if not safe_restart then return new;end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(new.user_id,'reprepare','calendar_operation',new.id,'user',jsonb_build_object('previous_hash',old.request_hash,'request_hash',new.request_hash));
 end if;
 if new.payload->>'sourceInboxId' is null then return new;end if;
 if new.operation_type<>'create' then raise exception 'invalid_inbox_calendar_intent';end if;
 source:=(new.payload->>'sourceInboxId')::uuid;
 new.payload:=jsonb_set(new.payload,'{sourceInboxId}',to_jsonb(source::text));
 select * into i from public.inbox_items where id=source and user_id=new.user_id for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 if new.request_id is null or new.request_hash is null or new.request_hash !~ '^[a-f0-9]{64}$' then raise exception 'inbox_request_conflict' using errcode='40001';end if;
 if tg_op='INSERT' then
  select * into existing from public.calendar_operations where id=new.id and user_id=new.user_id;
  if found then
   if row(existing.request_id,existing.request_hash,existing.payload) is distinct from row(new.request_id,new.request_hash,new.payload) then raise exception 'inbox_request_conflict' using errcode='40001';end if;
   return new;
  end if;
 end if;
 -- A safe cancellation releases this claim. All dispatched/failed/unknown,
 -- archived and remotely committed records still occupy the source.
 if tg_op='UPDATE' and new.status='cancelled' then return new;end if;
 if exists(select 1 from public.todo_creation_receipts r where r.user_id=new.user_id and r.inbox_id=source and r.status not in('rejected','cancelled'))
  or exists(select 1 from public.calendar_operations c where c.user_id=new.user_id and c.id<>new.id and c.operation_type='create' and c.payload->>'sourceInboxId'=source::text
    and not(((c.status='cancelled' and c.claimed_at is null) or (c.status='failed' and coalesce(c.result->>'writeOutcome'='not_written',false))) and c.provider_event_id is null and c.remote_committed_at is null and c.cache_committed_at is null))
  or i.converted_note_id is not null or i.converted_task_id is not null or i.converted_todo_task_id is not null or i.processed_at is not null or i.archived_at is not null then
  raise exception 'inbox_destination_conflict' using errcode='40001';
 end if;
 return new;
end $$;
revoke all on function private.guard_calendar_inbox_intent() from public,anon,authenticated,service_role;
create trigger calendar_inbox_intent before insert or update on public.calendar_operations for each row execute function private.guard_calendar_inbox_intent();

-- New external claims protect every completion field, including direct owner
-- UPDATEs. No-claim legacy a580 source finishes keep their existing semantics.
-- This is deliberately not a redesign of the inherited Inbox editing ACL.
create function private.guard_inbox_local_destination() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.todo_creation_receipts%rowtype; task_claim boolean; calendar_claim boolean;
begin
 select * into r from public.todo_creation_receipts where user_id=old.user_id and inbox_id=old.id and status not in('rejected','cancelled');
 task_claim:=found;
 calendar_claim:=exists(select 1 from public.calendar_operations c where c.user_id=old.user_id and c.operation_type='create' and c.payload->>'sourceInboxId'=old.id::text
  and not(((c.status='cancelled' and c.claimed_at is null) or (c.status='failed' and coalesce(c.result->>'writeOutcome'='not_written',false))) and c.provider_event_id is null and c.remote_committed_at is null and c.cache_committed_at is null));
 if not task_claim and not calendar_claim then return new;end if;
 if row(new.id,new.user_id) is distinct from row(old.id,old.user_id) then raise exception 'inbox_destination_conflict' using errcode='40001';end if;
 if row(new.processed_at,new.converted_task_id,new.converted_todo_task_id,new.converted_note_id) is not distinct from row(old.processed_at,old.converted_task_id,old.converted_todo_task_id,old.converted_note_id) then return new;end if;
 if task_claim and not calendar_claim and r.status in('remote_committed','available') and r.task_id is not null
  and new.processed_at is not null and new.converted_todo_task_id=r.task_id and new.converted_task_id is null and new.converted_note_id is null
  and exists(select 1 from public.microsoft_todo_tasks t where t.id=r.task_id and t.user_id=old.user_id and t.archived_at is null) then return new;end if;
 if calendar_claim and not task_claim and new.processed_at is not null and new.converted_task_id is null and new.converted_todo_task_id is null and new.converted_note_id is null
  and exists(select 1 from public.calendar_operations c where c.user_id=old.user_id and c.operation_type='create' and c.payload->>'sourceInboxId'=old.id::text and c.status='succeeded') then return new;end if;
 raise exception 'inbox_destination_conflict' using errcode='40001';
end $$;
revoke all on function private.guard_inbox_local_destination() from public,anon,authenticated,service_role;
create trigger inbox_local_destination before update on public.inbox_items for each row execute function private.guard_inbox_local_destination();

-- Append, preserve the previous version, finish source and audit in one DB
-- transaction. Lock Inbox first; then the actual live daily note, never a cached
-- body. A failed claim/CAS/audit rolls back all user content writes.
create function public.convert_inbox_daily(p_inbox_id uuid,p_note_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.inbox_items%rowtype; n public.notes%rowtype; marker text; entry text; body text; section_at integer; next_at integer; version_number integer; target_date text;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select * into i from public.inbox_items where id=p_inbox_id and user_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 marker:='<!-- inbox:'||i.id::text||' -->';
 if i.converted_note_id is not null then
  select * into n from public.notes where id=i.converted_note_id and user_id=auth.uid() and vault_group_id is null and archived_at is null and deleted_at is null;
  if not found or n.title !~ '^日记 · [0-9]{4}-[0-9]{2}-[0-9]{2}$' or strpos(n.body_markdown,marker)=0 then raise exception 'inbox_destination_conflict' using errcode='40001';end if;
  return jsonb_build_object('noteId',n.id,'date',right(n.title,10));
 end if;
 if i.processed_at is not null or i.converted_task_id is not null or i.converted_todo_task_id is not null then raise exception 'inbox_destination_conflict' using errcode='40001';end if;
 -- BEFORE UPDATE guard is also the canonical external-intent check; no content
 -- mutation can survive a rejected source finish below.
 select * into n from public.notes where id=p_note_id and user_id=auth.uid() and vault_group_id is null and archived_at is null and deleted_at is null for update;
 if not found then raise exception 'destination_unavailable' using errcode='42501';end if;
 if n.title !~ '^日记 · [0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_daily_note';end if;
 target_date:=right(n.title,10);
 if p_expected_revision is null or n.revision<>p_expected_revision then raise exception 'inbox_daily_conflict' using errcode='40001';end if;
 body:=n.body_markdown;
 if strpos(body,marker)=0 then
  entry:=btrim(i.content_markdown)||E'\n\n'||marker;
  section_at:=strpos(body,'## 感受与想法');
  if section_at=0 then body:=rtrim(body)||E'\n\n## 感受与想法\n\n'||entry||E'\n';
  else
   next_at:=strpos(substr(body,section_at+char_length('## 感受与想法')),E'\n## ');
   if next_at=0 then body:=rtrim(body)||E'\n\n'||entry||E'\n';
   else
    next_at:=next_at+section_at+char_length('## 感受与想法')-1;
    body:=rtrim(substr(body,1,next_at-1))||E'\n\n'||entry||E'\n'||substr(body,next_at);
   end if;
  end if;
  select coalesce(max(v.version_number),0)+1 into version_number from public.note_versions v where v.note_id=n.id;
  insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
   values(auth.uid(),n.id,n.title,n.body_markdown,version_number,auth.uid(),encode(sha256(convert_to(n.body_markdown,'UTF8')),'hex'),n.revision,'before_inbox_append');
  update public.notes set body_markdown=body,revision=n.revision+1,content_hash=encode(sha256(convert_to(body,'UTF8')),'hex'),word_count=case when btrim(body)='' then 0 else cardinality(regexp_split_to_array(btrim(body),'\s+')) end,character_count=char_length(body),last_saved_at=now() where id=n.id and user_id=auth.uid() and revision=p_expected_revision;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'append_inbox','note',n.id,'user',jsonb_build_object('inbox_id',i.id,'date',target_date));
 end if;
 update public.inbox_items set converted_note_id=n.id,processed_at=now(),archived_at=null where id=i.id and user_id=auth.uid();
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'convert','inbox_item',i.id,'user',jsonb_build_object('target','daily','destination_id',n.id,'date',target_date));
 return jsonb_build_object('noteId',n.id,'date',target_date);
end $$;
revoke all on function public.convert_inbox_daily(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.convert_inbox_daily(uuid,uuid,integer) to authenticated;

-- Service-only preparation: owner comes from the verified action boundary.
-- Every explicit user confirmation reuses or safely reparses the same receipt.
create function public.prepare_inbox_todo_creation(p_owner uuid,p_inbox_id uuid,p_request_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.todo_creation_receipts%rowtype; i public.inbox_items%rowtype;
begin
 select * into i from public.inbox_items where id=p_inbox_id and user_id=p_owner and archived_at is null for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 select * into r from public.todo_creation_receipts where user_id=p_owner and inbox_id=p_inbox_id for update;
 if not found then
  insert into public.todo_creation_receipts(user_id,inbox_id,request_id,request_hash) values(p_owner,p_inbox_id,p_inbox_id,p_request_hash) returning * into r;
 elsif r.status in('rejected','cancelled') and r.task_id is null then
  update public.todo_creation_receipts set status='prepared',request_hash=p_request_hash,updated_at=now() where id=r.id returning * into r;
 elsif r.request_hash<>p_request_hash then raise exception 'inbox_request_conflict' using errcode='40001';end if;
 if i.converted_note_id is not null or i.converted_task_id is not null or (i.processed_at is not null and (r.task_id is null or i.converted_todo_task_id is distinct from r.task_id)) or (i.converted_todo_task_id is not null and i.converted_todo_task_id is distinct from r.task_id) then raise exception 'inbox_destination_conflict' using errcode='40001';end if;
 return jsonb_build_object('id',r.id,'request_hash',r.request_hash,'status',r.status,'task_id',r.task_id);
end $$;
revoke all on function public.prepare_inbox_todo_creation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_inbox_todo_creation(uuid,uuid,text) to service_role;

create function public.prepare_inbox_calendar_creation(p_owner uuid,p_inbox_id uuid,p_request_hash text,p_connection_id uuid,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.calendar_operations%rowtype;
begin
 perform 1 from public.inbox_items where id=p_inbox_id and user_id=p_owner and archived_at is null for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 perform 1 from public.calendar_connections where id=p_connection_id and user_id=p_owner and archived_at is null;
 if not found or p_payload->>'sourceInboxId' is distinct from p_inbox_id::text then raise exception 'inbox_unavailable' using errcode='42501';end if;
 select * into c from public.calendar_operations where user_id=p_owner and operation_type='create' and payload->>'sourceInboxId'=p_inbox_id::text order by created_at desc limit 1 for update;
 if not found then
  insert into public.calendar_operations(id,user_id,request_id,request_hash,connection_id,operation_type,status,payload) values(p_inbox_id,p_owner,p_inbox_id,p_request_hash,p_connection_id,'create','pending_confirmation',p_payload) returning * into c;
 elsif ((c.status='cancelled' and c.claimed_at is null) or (c.status='failed' and coalesce(c.result->>'writeOutcome'='not_written',false))) and c.provider_event_id is null and c.remote_committed_at is null and c.cache_committed_at is null then
  update public.calendar_operations set status='pending_confirmation',request_hash=p_request_hash,payload=p_payload,connection_id=p_connection_id,claimed_at=null,confirmed_at=null,completed_at=null,error_code=null,result=null where id=c.id returning * into c;
 elsif c.request_hash<>p_request_hash then raise exception 'inbox_request_conflict' using errcode='40001';end if;
 return c.id;
end $$;
revoke all on function public.prepare_inbox_calendar_creation(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_inbox_calendar_creation(uuid,uuid,text,uuid,jsonb) to service_role;

-- A human may abandon only undispatched intents. Unknown/remote commits are
-- retained for reconciliation, including when the Inbox itself is archived.
create function public.cancel_inbox_undispatched(p_owner uuid,p_inbox_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare changed integer:=0; amount integer;
begin
 perform 1 from public.inbox_items where id=p_inbox_id and user_id=p_owner and processed_at is null for update;
 if not found then return false;end if;
 update public.todo_creation_receipts set status='cancelled',updated_at=now() where user_id=p_owner and inbox_id=p_inbox_id and status='prepared' and task_id is null;
 get diagnostics amount=row_count;changed:=changed+amount;
 update public.calendar_operations set status='cancelled',completed_at=now() where user_id=p_owner and operation_type='create' and payload->>'sourceInboxId'=p_inbox_id::text and status in('pending_confirmation','queued') and claimed_at is null and provider_event_id is null and remote_committed_at is null and cache_committed_at is null;
 get diagnostics amount=row_count;changed:=changed+amount;
 if changed>0 then insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(p_owner,'cancel_undispatched','inbox_item',p_inbox_id,'user',jsonb_build_object('intents',changed));end if;
 return changed>0;
end $$;
revoke all on function public.cancel_inbox_undispatched(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_inbox_undispatched(uuid,uuid) to service_role;

-- Archives remain reversible. Deleting a source/receipt cannot erase an
-- unresolved external intent and provide a new request-ID escape hatch.
create function private.retain_inbox_dispatch_intent() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='todo_creation_receipts' then raise exception 'dispatch_receipt_retained';end if;
 if tg_table_name='calendar_operations' then
  if old.payload->>'sourceInboxId' is not null then raise exception 'dispatch_receipt_retained';end if;
 elsif exists(select 1 from public.calendar_operations c where c.user_id=old.user_id and c.payload->>'sourceInboxId'=old.id::text)
  or exists(select 1 from public.todo_creation_receipts r where r.user_id=old.user_id and r.inbox_id=old.id) then
  raise exception 'inbox_dispatch_source_retained';
 end if;
 return old;
end $$;
revoke all on function private.retain_inbox_dispatch_intent() from public,anon,authenticated,service_role;
create trigger retain_todo_dispatch before delete on public.todo_creation_receipts for each row execute function private.retain_inbox_dispatch_intent();
create trigger retain_calendar_inbox_dispatch before delete on public.calendar_operations for each row execute function private.retain_inbox_dispatch_intent();
create trigger retain_inbox_dispatch_source before delete on public.inbox_items for each row execute function private.retain_inbox_dispatch_intent();
alter table public.inbox_items force row level security;
alter table public.calendar_operations force row level security;
