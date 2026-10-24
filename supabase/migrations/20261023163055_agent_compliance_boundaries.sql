-- F03/F09: ordinary authenticated writes stay SECURITY INVOKER and obey RLS.
-- Every note mutation below commits its content, immutable versions and audit
-- together. Existing deployed migrations remain unchanged.
create function public.mutate_note_atomic(
  p_operation text, p_note_id uuid, p_expected_revision integer default null,
  p_title text default null, p_body text default null, p_folder_id uuid default null,
  p_version_id uuid default null, p_reason text default 'manual'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  n public.notes%rowtype;
  v public.note_versions%rowtype;
  next_version integer;
  new_body text;
  new_title text;
  new_hash text;
begin
  if owner_id is null then raise exception 'not_authenticated'; end if;
  if p_operation not in ('create','update','restore','move') or p_note_id is null
    then raise exception 'invalid_note_operation'; end if;
  if p_folder_id is not null and not exists (
    select 1 from public.note_folders where id=p_folder_id and user_id=owner_id and archived_at is null
  ) then raise exception 'folder_changed'; end if;
  if p_operation = 'create' then
    if p_title is null or length(p_title) not between 1 and 240 or p_body is null or length(p_body)>800000
      then raise exception 'invalid_note_content'; end if;
    new_hash := encode(sha256(convert_to(p_body,'UTF8')),'hex');
    insert into public.notes(id,user_id,title,body_markdown,folder_id,status,revision,content_hash,
      character_count,word_count,last_saved_at)
    values(p_note_id,owner_id,p_title,p_body,p_folder_id,'active',1,new_hash,length(p_body),
      case when btrim(p_body)='' then 0 else cardinality(regexp_split_to_array(btrim(p_body),'\s+')) end,now())
    on conflict(id) do nothing returning * into n;
    if n.id is null then
      select * into n from public.notes where id=p_note_id and user_id=owner_id;
      if n.id is null or n.title<>p_title or n.body_markdown<>p_body or n.folder_id is distinct from p_folder_id
        then raise exception 'note_idempotency_conflict'; end if;
      return jsonb_build_object('id',n.id,'revision',n.revision,'duplicate',true);
    end if;
    insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
      values(owner_id,n.id,n.title,n.body_markdown,1,owner_id,n.content_hash,n.revision,p_reason);
  else
    select * into n from public.notes where id=p_note_id and user_id=owner_id
      and status='active' and deleted_at is null and archived_at is null for update;
    if n.id is null then raise exception 'note_not_found'; end if;
    if p_expected_revision is null or n.revision<>p_expected_revision then raise exception 'note_revision_conflict'; end if;
    if p_operation='move' then
      if n.folder_id is not null then raise exception 'note_revision_conflict'; end if;
      update public.notes set folder_id=p_folder_id,revision=revision+1 where id=n.id returning * into n;
    else
      if p_operation='restore' then
        select * into v from public.note_versions where id=p_version_id and note_id=n.id and user_id=owner_id;
        if v.id is null then raise exception 'note_version_not_found'; end if;
        new_body:=v.body_markdown; new_title:=v.title;
      else new_body:=p_body; new_title:=coalesce(p_title,n.title); end if;
      if new_body is null or length(new_body)>800000 or length(new_title) not between 1 and 240
        then raise exception 'invalid_note_content'; end if;
      select coalesce(max(version_number),0)+1 into next_version from public.note_versions where note_id=n.id;
      insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
        values(owner_id,n.id,n.title,n.body_markdown,next_version,owner_id,n.content_hash,n.revision,'before_'||p_operation);
      new_hash:=encode(sha256(convert_to(new_body,'UTF8')),'hex');
      update public.notes set title=new_title,body_markdown=new_body,content_hash=new_hash,
        character_count=length(new_body),word_count=case when btrim(new_body)='' then 0 else cardinality(regexp_split_to_array(btrim(new_body),'\s+')) end,
        revision=revision+1,last_saved_at=now() where id=n.id returning * into n;
      insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
        values(owner_id,n.id,n.title,n.body_markdown,next_version+1,owner_id,n.content_hash,n.revision,p_reason);
    end if;
  end if;
  insert into public.activity_events(user_id,entity_type,entity_id,action,metadata)
    values(owner_id,'note',n.id,p_operation,jsonb_build_object('revision',n.revision));
  insert into public.audit_logs(user_id,entity_type,entity_id,action,actor_type,after_data)
    values(owner_id,'note',n.id,p_operation,'user',jsonb_build_object('revision',n.revision,'version_id',p_version_id));
  return jsonb_build_object('id',n.id,'revision',n.revision,'duplicate',false);
end $$;
revoke all on function public.mutate_note_atomic(text,uuid,integer,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.mutate_note_atomic(text,uuid,integer,text,text,uuid,uuid,text) to authenticated;

create function public.move_note_new_folder_atomic(p_note_id uuid,p_expected_revision integer,p_folder_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target_folder_id uuid; note_revision integer;
begin
  if auth.uid() is null or length(btrim(p_folder_name)) not between 1 and 120 then raise exception 'invalid_note_operation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||lower(btrim(p_folder_name)),782));
  select n.revision into note_revision from public.notes n where n.id=p_note_id and n.user_id=auth.uid()
    and n.folder_id is null and n.status='active' and n.deleted_at is null and n.archived_at is null for update;
  if note_revision is distinct from p_expected_revision then raise exception 'note_revision_conflict'; end if;
  select id into target_folder_id from public.note_folders where user_id=auth.uid() and parent_id is null
    and lower(name)=lower(btrim(p_folder_name)) and archived_at is null limit 1;
  if target_folder_id is null then
    insert into public.note_folders(user_id,name) values(auth.uid(),btrim(p_folder_name)) returning id into target_folder_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
      values(auth.uid(),'create','note_folder',target_folder_id,'user','{}');
  end if;
  return public.mutate_note_atomic('move',p_note_id,p_expected_revision,null,null,target_folder_id,null,'assistant_confirmed');
end $$;
revoke all on function public.move_note_new_folder_atomic(uuid,integer,text) from public,anon;
grant execute on function public.move_note_new_folder_atomic(uuid,integer,text) to authenticated;

create function public.convert_inbox_note_atomic(p_inbox_id uuid,p_title text,p_body text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.inbox_items%rowtype; result jsonb;
begin
  select * into item from public.inbox_items where id=p_inbox_id and user_id=auth.uid() and archived_at is null for update;
  if item.id is null then raise exception 'inbox_not_found'; end if;
  if item.converted_note_id is not null then return item.converted_note_id; end if;
  if item.processed_at is not null then raise exception 'inbox_already_processed'; end if;
  result:=public.mutate_note_atomic('create',item.id,null,p_title,coalesce(nullif(p_body,''),item.content_markdown),null,null,'inbox_conversion');
  update public.inbox_items set converted_note_id=(result->>'id')::uuid,processed_at=now() where id=item.id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(auth.uid(),'convert_to_note','inbox_item',item.id,'user',jsonb_build_object('note_id',result->>'id'));
  return (result->>'id')::uuid;
end $$;
revoke all on function public.convert_inbox_note_atomic(uuid,text,text) from public,anon;
grant execute on function public.convert_inbox_note_atomic(uuid,text,text) to authenticated;

create function public.block_ai_source_atomic(p_domain text,p_source_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare blocked_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_domain='notes' then
    update public.notes set ai_visibility='never' where id=p_source_id and user_id=auth.uid() returning id into blocked_id;
  elsif p_domain='files' then
    update public.documents set ai_visibility='never' where id=p_source_id and user_id=auth.uid() returning id into blocked_id;
  else raise exception 'invalid_source_domain'; end if;
  if blocked_id is null then raise exception 'source_not_found'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(auth.uid(),'block_ai_source',case when p_domain='notes' then 'note' else 'document' end,blocked_id,'user',jsonb_build_object('ai_visibility','never','source','assistant_sources'));
  return blocked_id;
end $$;
revoke all on function public.block_ai_source_atomic(text,uuid) from public,anon;
grant execute on function public.block_ai_source_atomic(text,uuid) to authenticated;

-- F08: clients may propose, but cannot rewrite or forge execution state.
alter table public.agent_actions add column payload_hash text;
update public.agent_actions set payload_hash=encode(sha256(convert_to(
  action_type||payload_json::text||preview_json::text,'UTF8')),'hex');
alter table public.agent_actions alter column payload_hash set not null;
create function public.guard_frozen_agent_action() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if current_user <> 'service_role' and (new.status<>'proposed' or new.approved_at is not null
      or new.executed_at is not null or new.result_json<>'{}'::jsonb or new.error_code is not null)
      then raise exception 'invalid_proposal_state'; end if;
    new.payload_hash:=encode(sha256(convert_to(new.action_type||new.payload_json::text||new.preview_json::text,'UTF8')),'hex');
  elsif row(new.user_id,new.run_id,new.domain,new.action_type,new.payload_json,new.preview_json,new.risk_level,new.expires_at,new.payload_hash)
    is distinct from row(old.user_id,old.run_id,old.domain,old.action_type,old.payload_json,old.preview_json,old.risk_level,old.expires_at,old.payload_hash)
    then raise exception 'frozen_proposal';
  end if;
  return new;
end $$;
revoke all on function public.guard_frozen_agent_action() from public,anon,authenticated;
create trigger agent_actions_frozen before insert or update on public.agent_actions
  for each row execute function public.guard_frozen_agent_action();
revoke update,delete on public.agent_actions from authenticated;

create function public.transition_agent_action(p_user_id uuid,p_action_id uuid,p_hash text,p_status text,
  p_result jsonb default '{}'::jsonb,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_actions%rowtype;
begin
  select * into a from public.agent_actions where id=p_action_id and user_id=p_user_id for update;
  if a.id is null or a.payload_hash is distinct from p_hash then raise exception 'proposal_changed'; end if;
  if p_status in ('executing','rejected') then
    if a.status<>'proposed' or a.expires_at<=now() then raise exception 'proposal_unavailable'; end if;
  elsif p_status in ('succeeded','failed','conflict') then
    if a.status<>'executing' then raise exception 'proposal_unavailable'; end if;
  else raise exception 'invalid_proposal_transition'; end if;
  update public.agent_actions set status=p_status,
    approved_at=case when p_status='executing' then now() else approved_at end,
    executed_at=case when p_status<>'executing' then now() else null end,
    result_json=p_result,error_code=p_error where id=a.id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(p_user_id,'agent_action_'||p_status,'agent_action',a.id,'user',jsonb_build_object('action_type',a.action_type,'run_id',a.run_id));
  return jsonb_build_object('id',a.id,'action_type',a.action_type,'payload_json',a.payload_json,'run_id',a.run_id);
end $$;
revoke all on function public.transition_agent_action(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.transition_agent_action(uuid,uuid,text,text,jsonb,text) to service_role;

-- F05: budget check and reservation share a user-scoped transaction lock.
alter table public.ai_request_audits add column reserved_cost_usd numeric(12,6) not null default 0 check(reserved_cost_usd>=0);
create function public.reserve_ai_request(p_user_id uuid,p_metadata jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  g public.ai_governance_settings%rowtype;
  day_calls integer; month_calls integer; day_cost numeric; month_cost numeric;
  reserved numeric := (p_metadata->>'reserved_cost_usd')::numeric;
  reason text; audit_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,781));
  select * into g from public.ai_governance_settings where user_id=p_user_id;
  if reserved is null or reserved<0 then raise exception 'invalid_ai_reservation'; end if;
  select count(*) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),count(*),
    coalesce(sum(greatest(estimated_cost_usd,reserved_cost_usd)) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),
    coalesce(sum(greatest(estimated_cost_usd,reserved_cost_usd)),0)
    into day_calls,month_calls,day_cost,month_cost
    from public.ai_request_audits where user_id=p_user_id and archived_at is null
      and status in ('allowed','completed','failed','cancelled')
      and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if day_calls>=coalesce(g.daily_call_limit,40) then reason:='daily_call_limit';
  elsif month_calls>=coalesce(g.monthly_call_limit,600) then reason:='monthly_call_limit';
  elsif day_cost>=coalesce(g.daily_cost_limit_usd,2) or day_cost+reserved>coalesce(g.daily_cost_limit_usd,2) then reason:='daily_cost_limit';
  elsif month_cost>=coalesce(g.monthly_cost_limit_usd,20) or month_cost+reserved>coalesce(g.monthly_cost_limit_usd,20) then reason:='monthly_cost_limit'; end if;
  insert into public.ai_request_audits(user_id,run_id,surface,purpose,model,status,retrieval_mode,source_summary,
    retrieval_reason,context_chars,output_token_limit,reserved_cost_usd,error_code,completed_at)
    values(p_user_id,(p_metadata->>'run_id')::uuid,p_metadata->>'surface',p_metadata->>'purpose',p_metadata->>'model',
      case when reason is null then 'allowed' else 'blocked_budget' end,p_metadata->>'retrieval_mode',p_metadata->'source_summary',
      coalesce(p_metadata->>'retrieval_reason',''),(p_metadata->>'context_chars')::integer,(p_metadata->>'output_token_limit')::integer,
      case when reason is null then reserved else 0 end,reason,case when reason is not null then now() end)
    returning id into audit_id;
  return jsonb_build_object('id',audit_id,'allowed',reason is null,'code',reason);
end $$;
revoke all on function public.reserve_ai_request(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,jsonb) to service_role;

-- F11: apply the existing FORCE RLS contract to all current public domain and
-- technical tables, including future migration tables replayed before this one.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('alter table public.%I enable row level security',t.relname);
    execute format('alter table public.%I force row level security',t.relname);
  end loop;
end $$;
