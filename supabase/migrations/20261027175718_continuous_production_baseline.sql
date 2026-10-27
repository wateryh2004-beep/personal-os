-- Forward compatibility for metadata-confirmed missing baseline objects.
-- Apply after the ten continuous-workflow schema migrations.
-- Existing legitimate definitions are preserved except the exact known legacy
-- completion function, which is upgraded to the current atomic audit contract.


do $compat_review_source_is_owned$
declare existing oid:=to_regprocedure('public.review_source_is_owned(text, uuid, uuid)');
begin
 if existing is not null then
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=existing and p.prokind='f' and not p.prosecdef and not p.proretset and p.prorettype='boolean'::regtype)
   or not pg_catalog.has_function_privilege('authenticated',existing,'EXECUTE')
   or pg_catalog.has_function_privilege('anon',existing,'EXECUTE') then
   raise exception 'baseline_compatibility_existing_function_unexpected: review_source_is_owned' using errcode='55000';
  end if;
 else
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_source_is_owned') then
   raise exception 'baseline_compatibility_function_signature_conflict: review_source_is_owned' using errcode='55000';
  end if;
  execute $definition$
create function public.review_source_is_owned(
  p_source_type text,
  p_source_id uuid,
  p_user_id uuid
) returns boolean
language sql stable security invoker set search_path = '' as $$
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
$definition$;
  execute 'revoke all on function public.review_source_is_owned(text, uuid, uuid) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.review_source_is_owned(text, uuid, uuid) to authenticated';
 end if;
end;
$compat_review_source_is_owned$;


-- Completion is the one intentional forward upgrade: the exact known legacy
-- definition omitted atomic audit. Unknown or user-modified definitions fail closed.
do $compat_complete_review_with_sources$
declare
 existing oid:=to_regprocedure('public.complete_review_with_sources(text, text, text, date, date, text, jsonb, boolean, jsonb)');
 needs_upgrade boolean:=false;
 definition_sql text:=$definition$
create function public.complete_review_with_sources(
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
language plpgsql security invoker set search_path = '' as $$
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

  -- Serialize one owner's review key before classifying the first completion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array('review_completion', v_user_id, p_review_key)::text, 0
  ));

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

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, actor_type, after_data
  ) values (
    v_user_id,
    case when v_version_no > 1 then 'review_amend' else 'review_complete' end,
    'review', v_review_id, 'user',
    jsonb_build_object(
      'review_type', p_review_type,
      'period', p_review_key,
      'source_count', v_source_count,
      'generated_with_ai', p_generated_with_ai
    )
  );

  return jsonb_build_object(
    'review_id', v_review_id,
    'version_number', v_version_no,
    'source_count', v_source_count
  );
end;
$$;
$definition$;
begin
 if existing is not null then
  if not exists(
   select 1 from pg_catalog.pg_proc p
   where p.oid=existing and p.prokind='f' and not p.prosecdef and not p.proretset
    and not p.proisstrict and not p.proleakproof and p.provolatile='v'
    and p.prolang=(select oid from pg_catalog.pg_language where lanname='plpgsql')
    and p.prorettype='jsonb'::regtype and p.pronargdefaults=0
    and p.proargnames=array['p_review_type','p_review_key','p_title','p_period_start','p_period_end','p_content_markdown','p_structured_data','p_generated_with_ai','p_sources']::text[]
    and array(select acl::text from unnest(p.proacl) acl order by acl::text)=array['authenticated=X/postgres','postgres=X/postgres']::text[]
    and ((md5(p.prosrc)='72426d437364e96e3596d8c9c0424215' and p.proconfig=array['search_path=public']::text[])
      or (md5(p.prosrc)='01d9d71c10f6e5eaae96beed1dd9f685' and p.proconfig=array['search_path=""']::text[]))
  ) then
   raise exception 'baseline_compatibility_completion_definition_unrecognized' using errcode='55000';
  end if;
  select md5(p.prosrc)='72426d437364e96e3596d8c9c0424215' into needs_upgrade from pg_catalog.pg_proc p where p.oid=existing;
 elsif exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_review_with_sources') then
  raise exception 'baseline_compatibility_function_signature_conflict: complete_review_with_sources' using errcode='55000';
 end if;
 if existing is null then
  execute definition_sql;
  execute 'revoke all on function public.complete_review_with_sources(text, text, text, date, date, text, jsonb, boolean, jsonb) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.complete_review_with_sources(text, text, text, date, date, text, jsonb, boolean, jsonb) to authenticated';
 elsif needs_upgrade then
  -- Only the exact legacy body/config/ACL fingerprint above can reach REPLACE.
  -- CREATE OR REPLACE retains its owner and ACL; all other objects remain intact.
  execute replace(definition_sql,
   'create function public.complete_review_with_sources(',
   'create or replace function public.complete_review_with_sources(');
 end if;
end;
$compat_complete_review_with_sources$;


do $compat_accept_review_proposal$
declare existing oid:=to_regprocedure('public.accept_review_proposal(uuid)');
begin
 if existing is not null then
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=existing and p.prokind='f' and not p.prosecdef and not p.proretset and p.prorettype='jsonb'::regtype)
   or not pg_catalog.has_function_privilege('authenticated',existing,'EXECUTE')
   or pg_catalog.has_function_privilege('anon',existing,'EXECUTE') then
   raise exception 'baseline_compatibility_existing_function_unexpected: accept_review_proposal' using errcode='55000';
  end if;
 else
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_review_proposal') then
   raise exception 'baseline_compatibility_function_signature_conflict: accept_review_proposal' using errcode='55000';
  end if;
  execute $definition$
create function public.accept_review_proposal(
  p_proposal_id uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
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
$definition$;
  execute 'revoke all on function public.accept_review_proposal(uuid) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.accept_review_proposal(uuid) to authenticated';
 end if;
end;
$compat_accept_review_proposal$;


do $compat_dismiss_review_proposal$
declare existing oid:=to_regprocedure('public.dismiss_review_proposal(uuid)');
begin
 if existing is not null then
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=existing and p.prokind='f' and not p.prosecdef and not p.proretset and p.prorettype='uuid'::regtype)
   or not pg_catalog.has_function_privilege('authenticated',existing,'EXECUTE')
   or pg_catalog.has_function_privilege('anon',existing,'EXECUTE') then
   raise exception 'baseline_compatibility_existing_function_unexpected: dismiss_review_proposal' using errcode='55000';
  end if;
 else
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dismiss_review_proposal') then
   raise exception 'baseline_compatibility_function_signature_conflict: dismiss_review_proposal' using errcode='55000';
  end if;
  execute $definition$
create function public.dismiss_review_proposal(
  p_proposal_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
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
$definition$;
  execute 'revoke all on function public.dismiss_review_proposal(uuid) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.dismiss_review_proposal(uuid) to authenticated';
 end if;
end;
$compat_dismiss_review_proposal$;


do $compat_project_search$
declare existing oid:=to_regprocedure('public.sync_project_search_document()'); needs_backfill boolean:=false;
begin
 if existing is null then
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_project_search_document') then
   raise exception 'baseline_compatibility_project_function_signature_conflict' using errcode='55000';
  end if;
  execute $definition$
create function public.sync_project_search_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_documents
    where user_id = old.user_id
      and entity_type = 'project'
      and entity_id = old.id;
    return old;
  end if;

  if new.archived_at is not null then
    delete from public.search_documents
    where user_id = new.user_id
      and entity_type = 'project'
      and entity_id = new.id;
    return new;
  end if;

  insert into public.search_documents (
    user_id,
    domain,
    entity_type,
    entity_id,
    title,
    subtitle,
    content_text,
    metadata,
    source_updated_at
  ) values (
    new.user_id,
    'projects',
    'project',
    new.id,
    new.name,
    concat_ws(' · ', new.status::text, new.due_date::text),
    coalesce(new.description, ''),
    jsonb_build_object(
      'source_table', 'projects',
      'status', new.status,
      'due_date', new.due_date,
      'area_id', new.area_id
    ),
    new.updated_at
  )
  on conflict (user_id, entity_type, entity_id) do update set
    domain = excluded.domain,
    title = excluded.title,
    subtitle = excluded.subtitle,
    content_text = excluded.content_text,
    metadata = excluded.metadata,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  return new;
end;
$$;
$definition$;
  execute 'revoke all on function public.sync_project_search_document() from public, anon, authenticated, service_role';
  existing:=to_regprocedure('public.sync_project_search_document()');
  needs_backfill:=true;
 elsif not exists(select 1 from pg_catalog.pg_proc p where p.oid=existing and p.prokind='f' and not p.prosecdef and p.prorettype='trigger'::regtype) then
  raise exception 'baseline_compatibility_project_function_unexpected' using errcode='55000';
 end if;
 if exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.projects'::regclass and t.tgname='projects_search_sync') then
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.projects'::regclass and t.tgname='projects_search_sync' and t.tgfoid=existing and not t.tgisinternal and t.tgtype=29 and t.tgenabled='O' and t.tgqual is null) then
   raise exception 'baseline_compatibility_project_trigger_unexpected' using errcode='55000';
  end if;
 else
  execute 'create trigger projects_search_sync after insert or update or delete on public.projects for each row execute function public.sync_project_search_document()';
  needs_backfill:=true;
 end if;
 if needs_backfill then
  -- Derived project rows only. Authoritative projects and their versions remain intact.
  delete from public.search_documents indexed
   where indexed.entity_type='project' and not exists(
    select 1 from public.projects project where project.user_id=indexed.user_id and project.id=indexed.entity_id and project.archived_at is null);
insert into public.search_documents (
  user_id,
  domain,
  entity_type,
  entity_id,
  title,
  subtitle,
  content_text,
  metadata,
  source_updated_at
)
select
  project.user_id,
  'projects',
  'project',
  project.id,
  project.name,
  concat_ws(' · ', project.status::text, project.due_date::text),
  coalesce(project.description, ''),
  jsonb_build_object(
    'source_table', 'projects',
    'status', project.status,
    'due_date', project.due_date,
    'area_id', project.area_id
  ),
  project.updated_at
from public.projects as project
where project.archived_at is null
on conflict (user_id, entity_type, entity_id) do update set
  domain = excluded.domain,
  title = excluded.title,
  subtitle = excluded.subtitle,
  content_text = excluded.content_text,
  metadata = excluded.metadata,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();
 end if;
end;
$compat_project_search$;
