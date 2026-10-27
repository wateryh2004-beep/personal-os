-- Serialize actual agent generations; technical leases never restart restored work.
-- No new model/tool/right: serializes existing runs and rejects stale proposal/terminal writes.
alter table public.agent_runs add column generation_token uuid,add column generation_expires_at timestamptz,
 add constraint agent_generation_pair check((generation_token is null)=(generation_expires_at is null));
alter table public.agent_actions add column generation_token uuid;

create function private.guard_agent_generation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.generation_token is not null then raise exception 'agent_generation_retained' using errcode='42501';end if;return old;
 end if;
 if current_user in('postgres','service_role','supabase_admin') then return new;end if;
 if tg_op='INSERT' then
  if new.generation_token is not null or new.generation_expires_at is not null then raise exception 'agent_generation_server_managed' using errcode='42501';end if;
 elsif row(new.generation_token,new.generation_expires_at) is distinct from row(old.generation_token,old.generation_expires_at)
  or (old.generation_token is not null and row(new.status,new.model,new.error_code,new.kernel_state,new.context_mode,new.request_complexity,new.initial_modules,new.active_skills,new.initial_tool_names,new.discovered_tool_names,new.started_at,new.completed_at,new.current_entity_type,new.current_entity_id,new.surface)
   is distinct from row(old.status,old.model,old.error_code,old.kernel_state,old.context_mode,old.request_complexity,old.initial_modules,old.active_skills,old.initial_tool_names,old.discovered_tool_names,old.started_at,old.completed_at,old.current_entity_type,old.current_entity_id,old.surface))
  then raise exception 'agent_generation_server_managed' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_agent_generation() from public,anon,authenticated;
create trigger agent_generation_guard before insert or update or delete on public.agent_runs for each row execute function private.guard_agent_generation();

create function private.guard_agent_action_generation() returns trigger
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs%rowtype;
begin
 if tg_op='UPDATE' then
  if new.generation_token is distinct from old.generation_token then raise exception 'agent_action_generation_immutable' using errcode='42501';end if;
  return new; -- Existing proposal confirmation/CAS/expiry/receipt protocol is unchanged.
 end if;
 select * into run from public.agent_runs where id=new.run_id and user_id=new.user_id for update;
 if not found then raise exception 'agent_run_unavailable' using errcode='42501';end if;
 if run.generation_token is null then
  if new.generation_token is not null then raise exception 'agent_generation_conflict' using errcode='40001';end if;
 elsif new.generation_token is distinct from run.generation_token or run.status<>'running' or run.generation_expires_at<=clock_timestamp()
  then raise exception 'agent_generation_conflict' using errcode='40001';end if;
 return new;
end $$;
revoke all on function private.guard_agent_action_generation() from public,anon,authenticated;
create trigger agent_action_generation_guard before insert or update on public.agent_actions for each row execute function private.guard_agent_action_generation();

create function public.claim_agent_generation(p_run_id uuid,p_token uuid,p_allow_pending boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); run public.agent_runs%rowtype;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_token is null then raise exception 'agent_generation_invalid' using errcode='22023';end if;
 select * into run from public.agent_runs where id=p_run_id and user_id=owner for update;
 if not found or run.surface not in('global','notes-library','tasks','calendar','career') then raise exception 'agent_run_unavailable' using errcode='42501';end if;
 if run.status='running' and ((run.generation_token is not null and run.generation_expires_at>clock_timestamp()) or (run.generation_token is null and run.updated_at>clock_timestamp()-interval '120 seconds')) then return false;end if;
 -- Mutating requests must first handle visible frozen proposals. Read-only
 -- clarification may continue but receives no proposal tools in the runtime.
 if not coalesce(p_allow_pending,false) and exists(select 1 from public.agent_actions a where a.run_id=run.id and a.user_id=owner and a.status in('proposed','approved','executing')) then return false;end if;
 update public.agent_runs set generation_token=p_token,generation_expires_at=clock_timestamp()+interval '90 seconds',status='running',error_code=null,started_at=coalesce(started_at,clock_timestamp()),completed_at=null where id=run.id and user_id=owner;
 return true;
end $$;
revoke all on function public.claim_agent_generation(uuid,uuid,boolean) from public,anon;
grant execute on function public.claim_agent_generation(uuid,uuid,boolean) to authenticated;

create function public.update_agent_generation(p_run_id uuid,p_token uuid,p_patch jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); run public.agent_runs%rowtype; value public.agent_runs%rowtype; k text;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_token is null or jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>65536
  or exists(select 1 from jsonb_object_keys(p_patch) k where k not in('status','model','error_code','context_mode','request_complexity','initial_modules','active_skills','initial_tool_names','discovered_tool_names','kernel_state'))
  then raise exception 'agent_patch_invalid' using errcode='22023';end if;
 select * into run from public.agent_runs where id=p_run_id and user_id=owner for update;
 if not found or run.generation_token is distinct from p_token or run.status<>'running' or run.generation_expires_at<=clock_timestamp() then return false;end if;
 if not (p_patch ? 'status') or jsonb_typeof(p_patch->'status') is distinct from 'string'
  or p_patch->>'status' not in('running','awaiting_approval','completed','failed','cancelled') then raise exception 'agent_patch_invalid' using errcode='22023';end if;
 foreach k in array array['model','error_code','context_mode','request_complexity'] loop
  if p_patch ? k and jsonb_typeof(p_patch->k) not in('string','null') then raise exception 'agent_patch_invalid' using errcode='22023';end if;
 end loop;
 if p_patch ? 'context_mode' and p_patch->>'context_mode' is not null and p_patch->>'context_mode' not in('none','local','targeted','cross_module','action')
  or p_patch ? 'request_complexity' and p_patch->>'request_complexity' is not null and p_patch->>'request_complexity' not in('simple','moderate','deep') then raise exception 'agent_patch_invalid' using errcode='22023';end if;
 foreach k in array array['initial_modules','active_skills','initial_tool_names','discovered_tool_names'] loop
  if p_patch ? k then
   if jsonb_typeof(p_patch->k) is distinct from 'array' then raise exception 'agent_patch_invalid' using errcode='22023';end if;
   if jsonb_array_length(p_patch->k)>100 or exists(select 1 from jsonb_array_elements(p_patch->k) e where jsonb_typeof(e) is distinct from 'string') then raise exception 'agent_patch_invalid' using errcode='22023';end if;
  end if;
 end loop;
 if p_patch ? 'kernel_state' and (jsonb_typeof(p_patch->'kernel_state') is distinct from 'object'
  or p_patch->'kernel_state'->'binding' is distinct from jsonb_build_object('surface',run.surface,'currentEntity',case when run.current_entity_id is null then 'null'::jsonb else jsonb_build_object('type',run.current_entity_type,'id',run.current_entity_id) end)) then raise exception 'agent_binding_invalid' using errcode='22023';end if;
 value:=jsonb_populate_record(run,p_patch);
 if value.status not in('running','awaiting_approval','completed','failed','cancelled') then raise exception 'agent_patch_invalid' using errcode='22023';end if;
 if value.status='running' and (run.status<>'running' or run.generation_expires_at<=clock_timestamp()) then return false;end if;
 if jsonb_typeof(value.kernel_state) is distinct from 'object'
  or cardinality(value.initial_modules)>100 or cardinality(value.active_skills)>100 or cardinality(value.initial_tool_names)>100 or cardinality(value.discovered_tool_names)>100
  or (value.kernel_state ? 'binding' and value.kernel_state->'binding' is distinct from jsonb_build_object('surface',run.surface,'currentEntity',case when run.current_entity_id is null then 'null'::jsonb else jsonb_build_object('type',run.current_entity_type,'id',run.current_entity_id) end))
  then raise exception 'agent_binding_invalid' using errcode='22023';end if;
 update public.agent_runs set status=value.status,model=value.model,error_code=value.error_code,context_mode=value.context_mode,request_complexity=value.request_complexity,
  initial_modules=value.initial_modules,active_skills=value.active_skills,initial_tool_names=value.initial_tool_names,discovered_tool_names=value.discovered_tool_names,kernel_state=value.kernel_state,
  completed_at=case when value.status in('awaiting_approval','completed','failed','cancelled') then clock_timestamp() else null end
  where id=run.id and user_id=owner and generation_token=p_token;
 return true;
end $$;
revoke all on function public.update_agent_generation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.update_agent_generation(uuid,uuid,jsonb) to authenticated;

-- Existing human action resolvers may finish the aggregate run, but must not
-- overwrite a newer active generation and do not receive/claim its token.
create function public.complete_agent_run_if_resolved(p_run_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); run public.agent_runs%rowtype;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 select * into run from public.agent_runs where id=p_run_id and user_id=owner for update;
 if not found then raise exception 'agent_run_unavailable' using errcode='42501';end if;
 if run.status<>'awaiting_approval' or exists(select 1 from public.agent_actions a where a.run_id=run.id and a.user_id=owner and a.status in('proposed','approved','executing')) then return false;end if;
 update public.agent_runs set status='completed',completed_at=clock_timestamp() where id=run.id and user_id=owner and status='awaiting_approval';
 return true;
end $$;
revoke all on function public.complete_agent_run_if_resolved(uuid) from public,anon;
grant execute on function public.complete_agent_run_if_resolved(uuid) to authenticated;
