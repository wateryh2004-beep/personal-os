create unique index if not exists continuous_inbox_owner on public.inbox_items(user_id,id);
-- Domain-specific dispatch receipt: no task body or provider token is duplicated here.
create table public.todo_creation_receipts(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), request_id uuid not null,
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'), inbox_id uuid,
 task_id uuid, status text not null default 'prepared' check(status in('prepared','processing','remote_committed','available','unknown')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,request_id),foreign key(user_id,inbox_id) references public.inbox_items(user_id,id),
 foreign key(user_id,task_id) references public.microsoft_todo_tasks(user_id,id)
);
create unique index todo_creation_receipts_inbox on public.todo_creation_receipts(user_id,inbox_id) where inbox_id is not null;
create index todo_creation_receipts_task on public.todo_creation_receipts(user_id,task_id) where task_id is not null;
alter table public.todo_creation_receipts enable row level security;
alter table public.todo_creation_receipts force row level security;
create policy todo_creation_receipts_owner_read on public.todo_creation_receipts for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.todo_creation_receipts from public,anon,authenticated;
grant select on public.todo_creation_receipts to authenticated;
grant select,insert,update on public.todo_creation_receipts to service_role;

create or replace function public.finish_inbox_target(p_inbox_id uuid,p_target text,p_destination_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.inbox_items%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select * into i from public.inbox_items where id=p_inbox_id and user_id=auth.uid() and archived_at is null for update;
 if not found then return false;end if;
 if p_target='task' then
  perform 1 from public.microsoft_todo_tasks t where t.id=p_destination_id and t.user_id=auth.uid() and t.archived_at is null and exists(select 1 from public.todo_creation_receipts r where r.user_id=auth.uid() and r.inbox_id=p_inbox_id and r.task_id=t.id and r.status in('remote_committed','available'));
  if not found or i.converted_note_id is not null or i.converted_task_id is not null or (i.converted_todo_task_id is not null and i.converted_todo_task_id<>p_destination_id) then return false;end if;
  update public.inbox_items set processed_at=coalesce(processed_at,now()),converted_todo_task_id=p_destination_id where id=i.id;
 elsif p_target='calendar' then
  perform 1 from public.calendar_operations where id=p_destination_id and user_id=auth.uid() and status='succeeded' and payload->>'sourceInboxId'=p_inbox_id::text;
  if not found or i.converted_note_id is not null or i.converted_task_id is not null or i.converted_todo_task_id is not null then return false;end if;
  update public.inbox_items set processed_at=coalesce(processed_at,now()) where id=i.id;
 else return false;end if;
 if i.processed_at is null then insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'convert','inbox_item',i.id,'user',jsonb_build_object('target',p_target,'destination_id',p_destination_id));end if;
 return true;
end $$;
revoke all on function public.finish_inbox_target(uuid,text,uuid) from public,anon;
grant execute on function public.finish_inbox_target(uuid,text,uuid) to authenticated;

create or replace function public.convert_inbox_project(p_inbox_id uuid,p_project_id uuid,p_title text,p_body text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.inbox_items%rowtype; nid uuid; project uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 perform 1 from public.projects where id=p_project_id and user_id=auth.uid() and archived_at is null for share;
 if not found then raise exception 'project_unavailable' using errcode='42501';end if;
 select * into i from public.inbox_items where id=p_inbox_id and user_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501';end if;
 if i.converted_note_id is not null then
  select project_id into project from public.notes where id=i.converted_note_id and user_id=auth.uid() and vault_group_id is null and archived_at is null and deleted_at is null;
  if not found or project is distinct from p_project_id then raise exception 'destination_conflict' using errcode='40001';end if;
  -- Reuse the original immutable version-1 title/body replay proof after the
  -- project identity check. A different payload must never settle as saved.
  return public.convert_inbox_note(p_inbox_id,p_title,p_body);
 end if;
 nid:=public.convert_inbox_note(p_inbox_id,p_title,p_body);
 update public.notes set project_id=p_project_id where id=nid and user_id=auth.uid();
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'associate_project','note',nid,'user',jsonb_build_object('project_id',p_project_id,'inbox_id',i.id));
 return nid;
end $$;
revoke all on function public.convert_inbox_project(uuid,uuid,text,text) from public,anon;
grant execute on function public.convert_inbox_project(uuid,uuid,text,text) to authenticated;

-- Service executor only: exactly one audit and terminal receipt transaction.
create function public.finish_todo_creation_receipt(p_receipt_id uuid,p_owner uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.todo_creation_receipts%rowtype;
begin
 select * into r from public.todo_creation_receipts where id=p_receipt_id and user_id=p_owner for update;
 if not found then return false;end if;
 if r.status='available' then return true;end if;
 if r.status<>'remote_committed' or r.task_id is null then return false;end if;
 perform 1 from public.microsoft_todo_tasks where id=r.task_id and user_id=p_owner;
 if not found then return false;end if;
 if r.inbox_id is not null then
  perform 1 from public.inbox_items where id=r.inbox_id and user_id=p_owner and converted_todo_task_id=r.task_id and processed_at is not null;
  if not found then return false;end if;
 end if;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(p_owner,'create','microsoft_todo',r.task_id,'user',jsonb_build_object('provider','microsoft_todo','request_id',r.request_id));
 update public.todo_creation_receipts set status='available',updated_at=now() where id=r.id;
 return true;
end $$;
revoke all on function public.finish_todo_creation_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_todo_creation_receipt(uuid,uuid) to service_role;
