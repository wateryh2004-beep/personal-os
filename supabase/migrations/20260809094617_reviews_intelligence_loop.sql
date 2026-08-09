-- Reviews Intelligence Loop: deterministic evidence provenance and
-- human-confirmed Memory / Decision proposal resolution.

alter table public.agent_runs drop constraint if exists agent_runs_surface_check;
alter table public.agent_runs add constraint agent_runs_surface_check
  check (surface in ('global', 'calendar', 'tasks', 'inbox', 'career', 'notes', 'reviews'));

create or replace function public.review_source_is_owned(
  p_source_type text,
  p_source_id uuid,
  p_user_id uuid
) returns boolean
language sql stable security invoker set search_path = public as $$
  select case p_source_type
    when 'calendar_event' then exists(select 1 from public.calendar_events where id = p_source_id and user_id = p_user_id)
    when 'todo_task' then exists(select 1 from public.microsoft_todo_tasks where id = p_source_id and user_id = p_user_id)
    when 'note' then exists(select 1 from public.notes where id = p_source_id and user_id = p_user_id)
    when 'inbox_item' then exists(select 1 from public.inbox_items where id = p_source_id and user_id = p_user_id)
    when 'career_milestone' then exists(select 1 from public.career_milestones where id = p_source_id and user_id = p_user_id)
    when 'career_opportunity' then exists(select 1 from public.career_opportunities where id = p_source_id and user_id = p_user_id)
    when 'career_application' then exists(select 1 from public.career_applications where id = p_source_id and user_id = p_user_id)
    when 'project' then exists(select 1 from public.projects where id = p_source_id and user_id = p_user_id)
    when 'decision' then exists(select 1 from public.decisions where id = p_source_id and user_id = p_user_id)
    else false
  end;
$$;

revoke all on function public.review_source_is_owned(text, uuid, uuid) from public;
grant execute on function public.review_source_is_owned(text, uuid, uuid) to authenticated;

create or replace function public.complete_review_with_sources(
  p_review_type text,
  p_review_key text,
  p_title text,
  p_period_start date,
  p_period_end date,
  p_content_markdown text,
  p_structured_data jsonb,
  p_generated_with_ai boolean,
  p_sources jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_user_id uuid := (select auth.uid());
  v_review_id uuid;
  v_version_no integer;
  v_existing boolean;
  v_source_count integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_review_type not in ('daily', 'weekly') then raise exception 'invalid review type'; end if;
  if jsonb_typeof(coalesce(p_sources, '[]'::jsonb)) <> 'array' then raise exception 'sources must be an array'; end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) source
    where coalesce(source->>'sourceRole', '') not in ('context', 'cited')
      or not public.review_source_is_owned(
        source->>'sourceType',
        (source->>'sourceId')::uuid,
        v_user_id
      )
  ) then
    raise exception 'invalid or unowned review source';
  end if;

  select exists(
    select 1 from public.reviews
    where user_id = v_user_id and review_key = p_review_key
  ) into v_existing;

  insert into public.reviews (
    user_id, review_type, review_key, title, period_start, period_end,
    content_markdown, structured_data, status, generated_with_ai,
    source_snapshot_at, completed_at
  ) values (
    v_user_id, p_review_type, p_review_key, trim(p_title), p_period_start,
    p_period_end, p_content_markdown, p_structured_data, 'completed',
    p_generated_with_ai, now(), now()
  )
  on conflict (user_id, review_key) do update set
    title = excluded.title,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    content_markdown = excluded.content_markdown,
    structured_data = excluded.structured_data,
    status = 'completed',
    generated_with_ai = excluded.generated_with_ai,
    source_snapshot_at = excluded.source_snapshot_at,
    completed_at = now()
  returning id into v_review_id;

  select coalesce(max(version_number), 0) + 1
  into v_version_no
  from public.review_versions
  where review_id = v_review_id;

  insert into public.review_versions (
    user_id, review_id, version_number, content_markdown,
    structured_data, reason
  ) values (
    v_user_id, v_review_id, v_version_no, p_content_markdown,
    p_structured_data, case when v_existing then 'amended' else 'completed' end
  );

  delete from public.review_sources
  where review_id = v_review_id
    and user_id = v_user_id
    and source_role in ('context', 'cited');

  insert into public.review_sources (
    user_id, review_id, source_type, source_id, source_role
  )
  select distinct
    v_user_id,
    v_review_id,
    source->>'sourceType',
    (source->>'sourceId')::uuid,
    source->>'sourceRole'
  from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) source;

  select count(*) into v_source_count
  from public.review_sources
  where review_id = v_review_id and user_id = v_user_id;

  return jsonb_build_object(
    'review_id', v_review_id,
    'version_number', v_version_no,
    'source_count', v_source_count
  );
end;
$$;

revoke all on function public.complete_review_with_sources(
  text, text, text, date, date, text, jsonb, boolean, jsonb
) from public;
grant execute on function public.complete_review_with_sources(
  text, text, text, date, date, text, jsonb, boolean, jsonb
) to authenticated;

create or replace function public.accept_review_proposal(
  p_proposal_id uuid
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_user_id uuid := (select auth.uid());
  v_proposal public.review_proposals;
  v_decision public.decisions;
  v_result_id uuid;
  v_result_type text;
  v_review_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select * into v_proposal
  from public.review_proposals
  where id = p_proposal_id and user_id = v_user_id
  for update;

  if v_proposal.id is null then raise exception 'proposal not found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'proposal already resolved'; end if;
  if not exists (
    select 1 from public.reviews
    where id = v_proposal.review_id
      and user_id = v_user_id
      and status = 'completed'
      and archived_at is null
  ) then raise exception 'completed review not found'; end if;

  if v_proposal.proposal_type in ('profile_memory', 'working_memory') then
    if v_proposal.proposal_type = 'working_memory' then
      v_review_at := nullif(v_proposal.payload->>'reviewAt', '')::timestamptz;
      if v_review_at is null then raise exception 'working memory review date required'; end if;
    end if;
    insert into public.personal_memories (
      user_id, memory_type, memory_key, title, content, ai_visibility,
      review_at, created_via, structured_data
    ) values (
      v_user_id,
      case when v_proposal.proposal_type = 'profile_memory' then 'profile' else 'working' end,
      concat(v_proposal.proposal_type, ':review-proposal:', v_proposal.id),
      trim(v_proposal.payload->>'title'),
      trim(v_proposal.payload->>'content'),
      'normal',
      v_review_at,
      'assistant_proposal',
      jsonb_build_object('review_id', v_proposal.review_id, 'rationale', v_proposal.payload->>'rationale')
    ) returning id into v_result_id;
    v_result_type := 'personal_memory';

    insert into public.memory_sources (user_id, memory_id, source_type, source_id, source_role)
    select distinct v_user_id, v_result_id, sources.source_type, sources.source_id, 'evidence'
    from public.review_sources sources
    where sources.review_id = v_proposal.review_id
      and sources.user_id = v_user_id
      and sources.source_id in (
        select jsonb_array_elements_text(coalesce(v_proposal.payload->'evidenceSourceIds', '[]'::jsonb))::uuid
      )
    on conflict do nothing;
  else
    select * into v_decision
    from public.decisions
    where id = nullif(v_proposal.payload->>'decisionId', '')::uuid
      and user_id = v_user_id
      and status = 'active'
      and archived_at is null
      and exists (
        select 1 from public.review_sources source
        where source.review_id = v_proposal.review_id
          and source.user_id = v_user_id
          and source.source_type = 'decision'
          and source.source_id = decisions.id
      )
    for update;
    if v_decision.id is null then raise exception 'active decision not found'; end if;

    if v_proposal.proposal_type = 'decision_keep' then
      update public.decisions
      set last_reviewed_at = now(), review_at = null
      where id = v_decision.id;
      v_result_id := v_decision.id;
    else
      update public.decisions
      set status = case
        when v_proposal.proposal_type = 'decision_reverse' then 'reversed'
        else 'superseded'
      end,
      last_reviewed_at = now()
      where id = v_decision.id;

      insert into public.decisions (
        user_id, title, decision_text, rationale_markdown, context_markdown,
        status, importance, created_via, ai_visibility, decided_at,
        supersedes_decision_id
      ) values (
        v_user_id,
        trim(v_proposal.payload->>'title'),
        trim(v_proposal.payload->>'content'),
        coalesce(v_proposal.payload->>'rationale', ''),
        v_decision.context_markdown,
        'active',
        v_decision.importance,
        'assistant_proposal',
        v_decision.ai_visibility,
        now(),
        v_decision.id
      ) returning id into v_result_id;
    end if;
    v_result_type := 'decision';

    insert into public.decision_sources (user_id, decision_id, source_type, source_id, source_role)
    select distinct v_user_id, v_result_id, sources.source_type, sources.source_id, 'context'
    from public.review_sources sources
    where sources.review_id = v_proposal.review_id
      and sources.user_id = v_user_id
      and sources.source_id in (
        select jsonb_array_elements_text(coalesce(v_proposal.payload->'evidenceSourceIds', '[]'::jsonb))::uuid
      )
    on conflict do nothing;
  end if;

  update public.review_proposals
  set status = 'accepted',
      resulting_entity_type = v_result_type,
      resulting_entity_id = v_result_id,
      resolved_at = now()
  where id = v_proposal.id;

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, actor_type, after_data
  ) values (
    v_user_id,
    'review_proposal_accept',
    'review_proposal',
    v_proposal.id,
    'user',
    jsonb_build_object(
      'proposal_type', v_proposal.proposal_type,
      'resulting_entity_type', v_result_type,
      'resulting_entity_id', v_result_id
    )
  );

  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'resulting_entity_type', v_result_type,
    'resulting_entity_id', v_result_id
  );
end;
$$;

revoke all on function public.accept_review_proposal(uuid) from public;
grant execute on function public.accept_review_proposal(uuid) to authenticated;

create or replace function public.dismiss_review_proposal(
  p_proposal_id uuid
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_user_id uuid := (select auth.uid());
  v_proposal_id uuid;
  v_proposal_type text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  update public.review_proposals
  set status = 'dismissed', resolved_at = now()
  where id = p_proposal_id
    and user_id = v_user_id
    and status = 'pending'
  returning id, proposal_type into v_proposal_id, v_proposal_type;
  if v_proposal_id is null then raise exception 'pending proposal not found'; end if;
  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, actor_type, after_data
  ) values (
    v_user_id, 'review_proposal_dismiss', 'review_proposal',
    v_proposal_id, 'user', jsonb_build_object('proposal_type', v_proposal_type)
  );
  return v_proposal_id;
end;
$$;

revoke all on function public.dismiss_review_proposal(uuid) from public;
grant execute on function public.dismiss_review_proposal(uuid) to authenticated;
