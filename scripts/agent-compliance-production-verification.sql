-- Bounded synthetic production verification. No provider calls or permanent rows.
-- Requires the reviewed compliance migration. Every synthetic row is rolled back.
begin;
set local statement_timeout = '20s';
do $$
declare
  owner_id uuid := gen_random_uuid();
  peer_id uuid := gen_random_uuid();
  fixture_note_id uuid := gen_random_uuid();
  inbox_id uuid := gen_random_uuid();
  run_id uuid := gen_random_uuid();
  action_id uuid := gen_random_uuid();
  version_id uuid;
  frozen_hash text;
  result jsonb;
  denied boolean;
begin
  insert into auth.users(id) values(owner_id),(peer_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  result := public.mutate_note_atomic('create',fixture_note_id,null,'Synthetic compliance verification','synthetic v1');
  if (result->>'revision')::int <> 1 then raise exception 'verification_create'; end if;
  result := public.mutate_note_atomic('create',fixture_note_id,null,'Synthetic compliance verification','synthetic v1');
  if not (result->>'duplicate')::boolean then raise exception 'verification_idempotency'; end if;
  select v.id into version_id from public.note_versions v where v.note_id=fixture_note_id and v.user_id=owner_id order by v.version_number limit 1;
  perform public.mutate_note_atomic('update',fixture_note_id,1,'Synthetic compliance verification','synthetic v2');
  denied := false;
  begin
    perform public.mutate_note_atomic('restore',fixture_note_id,1,null,null,null,version_id);
  exception when others then
    if sqlerrm <> 'note_revision_conflict' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'verification_stale_restore'; end if;
  perform public.mutate_note_atomic('restore',fixture_note_id,2,null,null,null,version_id);
  if (select count(*) from public.note_versions v where v.note_id=fixture_note_id) <> 5 then raise exception 'verification_versions'; end if;
  perform public.block_ai_source_atomic('notes',fixture_note_id);
  if not exists(select 1 from public.notes n where n.id=fixture_note_id and n.ai_visibility='never') then raise exception 'verification_opt_out'; end if;
  perform public.move_note_new_folder_atomic(fixture_note_id,3,'Synthetic compliance verification');
  insert into public.inbox_items(id,user_id,content_markdown) values(inbox_id,owner_id,'synthetic inbox');
  if public.convert_inbox_note_atomic(inbox_id,'Synthetic inbox note','synthetic inbox') <> inbox_id then raise exception 'verification_inbox'; end if;
  perform set_config('request.jwt.claim.sub',peer_id::text,true);
  if exists(select 1 from public.notes n where n.id=fixture_note_id) then raise exception 'verification_owner_visibility'; end if;
  denied := false;
  begin
    perform public.block_ai_source_atomic('notes',fixture_note_id);
  exception when others then
    if sqlerrm <> 'source_not_found' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'verification_owner_write'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.agent_runs(id,user_id,surface) values(run_id,owner_id,'global');
  insert into public.agent_actions(id,user_id,run_id,domain,action_type,payload_json,preview_json,risk_level,status,expires_at)
    values(action_id,owner_id,run_id,'notes','notes.create','{"title":"Synthetic"}','{"title":"Synthetic"}','low','proposed',now()+interval '1 hour');
  select a.payload_hash into frozen_hash from public.agent_actions a where a.id=action_id;
  denied := false;
  begin
    update public.agent_actions set status='succeeded' where id=action_id;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'verification_client_forgery'; end if;
  reset role;
  set local role service_role;
  denied := false;
  begin
    update public.agent_actions set payload_json='{}' where id=action_id;
  exception when others then
    if sqlerrm <> 'frozen_proposal' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'verification_frozen_payload'; end if;
  perform public.transition_agent_action(owner_id,action_id,frozen_hash,'executing');
  denied := false;
  begin
    perform public.transition_agent_action(owner_id,action_id,frozen_hash,'executing');
  exception when others then
    if sqlerrm <> 'proposal_unavailable' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'verification_repeated_claim'; end if;
  perform public.transition_agent_action(owner_id,action_id,frozen_hash,'succeeded');
  insert into public.ai_governance_settings(user_id,daily_call_limit) values(owner_id,1);
  result := public.reserve_ai_request(owner_id,'{"surface":"synthetic","purpose":"production-verification-rollback","model":"synthetic","retrieval_mode":"none","source_summary":{},"context_chars":0,"output_token_limit":100,"reserved_cost_usd":0.01}');
  if not (result->>'allowed')::boolean then raise exception 'verification_first_reservation'; end if;
  result := public.reserve_ai_request(owner_id,'{"surface":"synthetic","purpose":"production-verification-rollback","model":"synthetic","retrieval_mode":"none","source_summary":{},"context_chars":0,"output_token_limit":100,"reserved_cost_usd":0.01}');
  if (result->>'allowed')::boolean or result->>'code'<>'daily_call_limit' then raise exception 'verification_budget_limit'; end if;
  reset role;
  set local role anon;
  denied := false;
  begin
    perform public.mutate_note_atomic('create',gen_random_uuid(),null,'Anonymous','synthetic');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'verification_anonymous'; end if;
  reset role;
end $$;
rollback;
select 'PASS: synthetic note/CAS/versions/inbox/source/owner/frozen proposal/budget/anonymous checks; transaction rolled back' as verification;
