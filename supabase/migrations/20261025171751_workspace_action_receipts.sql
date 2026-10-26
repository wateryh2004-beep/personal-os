-- Transient operation/undo state. Excluded from portable restoration; never replay.
create table public.workspace_action_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null check (length(request_hash) between 16 and 128),
  operation text not null check (operation in (
    'note_rename','note_move','note_trash','note_archive','file_rename','file_move','file_archive','graph_link',
    'tasks_update','tasks_complete','calendar_create','calendar_update',
    'shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order',
    'travel_next_stop','travel_document','leisure_progress','travel_stop_add'
  )),
  target_id uuid not null,
  before_data jsonb not null default '{}'::jsonb check (octet_length(before_data::text) <= 65536),
  after_data jsonb not null default '{}'::jsonb check (octet_length(after_data::text) <= 65536),
  after_revision bigint not null default 0 check (after_revision >= 0),
  status text not null default 'available' check (status in ('prepared','processing','available','undone','unknown','failed','conflict','remote_committed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  undone_at timestamptz,
  unique(user_id, request_id)
);
alter table public.workspace_action_receipts enable row level security;
alter table public.workspace_action_receipts force row level security;
revoke all on public.workspace_action_receipts from public,anon,authenticated;
grant select on public.workspace_action_receipts to authenticated;
grant all on public.workspace_action_receipts to service_role;
create policy workspace_receipts_owner_read on public.workspace_action_receipts for select to authenticated using (user_id=(select auth.uid()));
create index workspace_receipts_recent on public.workspace_action_receipts(user_id,created_at desc);

-- Only protected, fixed-domain transaction functions or the authenticated server
-- integration may call this. Browser input can never provide before/after.
create function public._record_workbench_receipt(
  p_owner uuid,p_request_id uuid,p_request_hash text,p_operation text,p_target uuid,
  p_before jsonb,p_after jsonb,p_after_revision bigint
) returns uuid language plpgsql set search_path='' as $$
declare receipt public.workspace_action_receipts; result uuid;
begin
  if p_owner is null or (auth.role() is distinct from 'service_role' and auth.uid() is distinct from p_owner) then raise exception 'workbench_unauthorized'; end if;
  select * into receipt from public.workspace_action_receipts where user_id=p_owner and request_id=p_request_id for update;
  if found then
    if receipt.request_hash<>p_request_hash or receipt.operation<>p_operation then raise exception 'workbench_request_conflict'; end if;
    return receipt.id;
  end if;
  insert into public.workspace_action_receipts(user_id,request_id,request_hash,operation,target_id,before_data,after_data,after_revision)
  values(p_owner,p_request_id,p_request_hash,p_operation,p_target,p_before,p_after,p_after_revision) returning id into result;
  return result;
end $$;
revoke all on function public._record_workbench_receipt(uuid,uuid,text,text,uuid,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public._record_workbench_receipt(uuid,uuid,text,text,uuid,jsonb,jsonb,bigint) to service_role;

-- Integration finalize is atomic with its safe audit. The provider commit itself
-- is external; a database failure never means that remote state was rolled back.
create function public.finish_workbench_provider_receipt(p_receipt_id uuid,p_owner uuid,p_after jsonb,p_status text) returns void
language plpgsql set search_path='' as $$
declare r public.workspace_action_receipts;
begin
 if auth.role() is distinct from 'service_role' or p_status not in ('available','remote_committed') then raise exception 'workbench_unauthorized'; end if;
 select * into r from public.workspace_action_receipts where id=p_receipt_id and user_id=p_owner and status='processing' for update;
 if not found then raise exception 'workbench_conflict'; end if;
 update public.workspace_action_receipts set after_data=p_after,status=p_status where id=r.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(p_owner,r.operation,'workspace_action',r.target_id,'user',jsonb_build_object('receipt_id',r.id,'request_id',r.request_id,'result',p_status));
end $$;
revoke all on function public.finish_workbench_provider_receipt(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_workbench_provider_receipt(uuid,uuid,jsonb,text) to service_role;
