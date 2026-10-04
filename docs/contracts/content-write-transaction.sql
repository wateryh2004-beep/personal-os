-- PREPARED PROPOSAL ONLY. Not applied locally or remotely.
-- Supabase CLI is not installed in the editing environment. Before deployment:
-- generate a migration with `supabase migration new content_write_transaction`,
-- copy this reviewed proposal into it, then run isolated RLS/concurrency tests.
-- No credentials, owner provisioning, policy changes, or new tables are needed.
-- Installation must verify existing authenticated grants: SELECT/INSERT/UPDATE
-- notes; SELECT/INSERT note_versions and audit_logs; SELECT note_folders;
-- SELECT interview_questions/contexts/preparations and SELECT/INSERT answers.
-- SELECT ... FOR UPDATE also requires UPDATE privilege on locked tables;
-- interview migrations already grant it. Do not silently elevate privileges.
-- The HTTP boundary must verify the configured owner and use that owner's JWT.

begin;

-- audit_logs is already owner-scoped, append-only, and has request_id UUID.
-- A receipt shares the same transaction as the content and retained versions.
create unique index content_write_receipt_unique_idx
  on public.audit_logs(user_id, request_id)
  where action = 'content.write' and request_id is not null;

create function public.write_content(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_operation text;
  v_operation_id uuid;
  v_allowed text[];
  v_required text[];
  v_hash text;
  v_receipt jsonb;
  v_result jsonb;
  v_note public.notes%rowtype;
  v_answer public.interview_answer_versions%rowtype;
  v_preparation public.interview_question_preparations%rowtype;
  v_note_id uuid;
  v_folder_id uuid;
  v_preparation_id uuid;
  v_base_answer_id uuid;
  v_expected_revision integer;
  v_expected_version integer;
  v_expected_updated_at timestamptz;
  v_latest_version integer;
  v_snapshot_version integer;
  v_seconds integer;
  v_title text;
  v_body text;
  v_body_hash text;
  v_source text;
  v_source_url text;
  v_content_origin text;
  v_capture_mode text;
  v_mode text;
  v_language text;
  v_change_note text;
  v_before jsonb;
begin
  -- No caller-supplied user_id and no definer/service-role elevation.
  if v_user is null then
    raise exception using errcode = '42501', message = 'authenticated owner session required';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid content command';
  end if;
  v_operation := p_command->>'operation';
  v_required := array['operation', 'operationId', 'source', 'bodyMarkdown'];
  if v_operation = 'note.create' then
    v_required := v_required || array['title', 'contentOrigin'];
    v_allowed := v_required || array['sourceUrl', 'folderId', 'captureMode'];
  elsif v_operation = 'note.update' then
    v_required := v_required || array['title', 'contentOrigin', 'noteId', 'expectedRevision', 'expectedUpdatedAt'];
    v_allowed := v_required || array['sourceUrl', 'captureMode'];
  elsif v_operation = 'interview.answer.append' then
    v_required := v_required || array['preparationId', 'answerMode', 'language', 'targetSeconds', 'expectedVersion', 'expectedAnswerId', 'expectedUpdatedAt'];
    v_allowed := v_required || array['sourceUrl', 'changeNote'];
  else
    raise exception using errcode = '22023', message = 'unsupported content operation';
  end if;
  if not (p_command ?& v_required) or exists (
    select 1 from jsonb_object_keys(p_command) as k(key) where not (k.key = any(v_allowed))
  ) then
    raise exception using errcode = '22023', message = 'unexpected or missing content command field';
  end if;
  if jsonb_typeof(p_command->'operationId') <> 'string'
    or jsonb_typeof(p_command->'source') <> 'string'
    or jsonb_typeof(p_command->'bodyMarkdown') <> 'string'
  then
    raise exception using errcode = '22023', message = 'invalid content command field type';
  end if;
  v_operation_id := (p_command->>'operationId')::uuid;
  v_source := p_command->>'source';
  v_body := p_command->>'bodyMarkdown';
  if v_source not in ('codex', 'claude', 'external_agent') or char_length(v_body) > 200000 then
    raise exception using errcode = '22023', message = 'invalid content source or body';
  end if;
  if p_command ? 'sourceUrl' and jsonb_typeof(p_command->'sourceUrl') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid source URL type';
  end if;
  v_source_url := p_command->>'sourceUrl';
  if v_source_url is not null and (char_length(v_source_url) > 2000 or v_source_url !~* '^https?://[^/[:space:]]+') then
    raise exception using errcode = '22023', message = 'invalid source URL';
  end if;

  -- The canonical JSONB fingerprint includes the target, CAS values, full bytes,
  -- and source metadata. Changing anything requires a new operation ID.
  v_hash := encode(sha256(convert_to(p_command::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_operation_id::text, 0));
  select a.after_data into v_receipt from public.audit_logs a
    where a.user_id = v_user and a.request_id = v_operation_id and a.action = 'content.write';
  if found then
    if v_receipt->>'commandHash' is distinct from v_hash then
      raise exception using errcode = 'P0102', message = 'operation ID already used for a different command';
    end if;
    return (v_receipt->'result') || jsonb_build_object('replayed', true);
  end if;
  v_body_hash := encode(sha256(convert_to(v_body, 'UTF8')), 'hex');

  if v_operation in ('note.create', 'note.update') then
    if jsonb_typeof(p_command->'title') <> 'string' or jsonb_typeof(p_command->'contentOrigin') <> 'string' then
      raise exception using errcode = '22023', message = 'invalid note title type';
    end if;
    v_content_origin := p_command->>'contentOrigin';
    if v_content_origin not in ('human', 'ai_generated')
      or (p_command ? 'captureMode' and jsonb_typeof(p_command->'captureMode') not in ('string', 'null'))
    then
      raise exception using errcode = '22023', message = 'invalid authorship or capture mode';
    end if;
    v_capture_mode := p_command->>'captureMode';
    if v_capture_mode is not null and v_capture_mode not in ('original', 'curated') then
      raise exception using errcode = '22023', message = 'invalid capture mode';
    end if;
    v_title := p_command->>'title';
    if char_length(v_title) > 240 or char_length(btrim(v_title)) = 0 then
      raise exception using errcode = '22023', message = 'invalid note title';
    end if;
    if v_operation = 'note.create' then
      if p_command ? 'folderId' and jsonb_typeof(p_command->'folderId') not in ('string', 'null') then
        raise exception using errcode = '22023', message = 'invalid folder ID type';
      end if;
      v_folder_id := (p_command->>'folderId')::uuid;
      if v_folder_id is not null and not exists (
        select 1 from public.note_folders f where f.id = v_folder_id and f.user_id = v_user and f.archived_at is null
      ) then
        raise exception using errcode = 'P0103', message = 'selected folder unavailable';
      end if;
      insert into public.notes(user_id, folder_id, title, body_markdown, status, revision,
        content_hash, word_count, character_count, last_saved_at, content_origin, ai_visibility)
      values(v_user, v_folder_id, v_title, v_body, 'active', 1, v_body_hash,
        case when btrim(v_body) = '' then 0 else cardinality(regexp_split_to_array(btrim(v_body), '\s+')) end,
        char_length(v_body), now(), v_content_origin, 'normal')
      returning * into v_note;
      v_snapshot_version := 1;
    else
      if jsonb_typeof(p_command->'noteId') <> 'string'
        or jsonb_typeof(p_command->'expectedRevision') <> 'number'
        or (p_command->>'expectedRevision') !~ '^[0-9]+$'
        or jsonb_typeof(p_command->'expectedUpdatedAt') <> 'string'
      then
        raise exception using errcode = '22023', message = 'invalid note compare-and-swap fields';
      end if;
      v_note_id := (p_command->>'noteId')::uuid;
      v_expected_revision := (p_command->>'expectedRevision')::integer;
      v_expected_updated_at := (p_command->>'expectedUpdatedAt')::timestamptz;
      if v_expected_revision > 2147483646 or not isfinite(v_expected_updated_at) then
        raise exception using errcode = '22023', message = 'invalid note compare-and-swap values';
      end if;
      select * into v_note from public.notes n where n.id = v_note_id and n.user_id = v_user
        and n.status = 'active' and n.archived_at is null and n.deleted_at is null and n.ai_visibility = 'normal'
        for update;
      if not found then
        raise exception using errcode = 'P0103', message = 'selected note unavailable';
      end if;
      if v_note.revision <> v_expected_revision or v_note.updated_at <> v_expected_updated_at then
        raise exception using errcode = 'P0101', message = 'note changed since it was read';
      end if;
      select coalesce(max(nv.version_number), 0) + 1 into v_snapshot_version
        from public.note_versions nv where nv.note_id = v_note.id and nv.user_id = v_user;
      -- The old body may have been autosaved without a snapshot. Retain it first.
      insert into public.note_versions(user_id, note_id, title, body_markdown, version_number,
        created_by, content_hash, revision, reason)
      values(v_user, v_note.id, v_note.title, v_note.body_markdown, v_snapshot_version,
        v_user, encode(sha256(convert_to(v_note.body_markdown, 'UTF8')), 'hex'), v_note.revision, 'before_external_update');
      v_snapshot_version := v_snapshot_version + 1;
      v_before := jsonb_build_object('revision', v_note.revision, 'updatedAt', v_note.updated_at, 'contentOrigin', v_note.content_origin);
      update public.notes set title = v_title, body_markdown = v_body,
        content_hash = v_body_hash, revision = v_note.revision + 1,
        word_count = case when btrim(v_body) = '' then 0 else cardinality(regexp_split_to_array(btrim(v_body), '\s+')) end,
        character_count = char_length(v_body), last_saved_at = now(), content_origin = v_content_origin
        where id = v_note.id and user_id = v_user returning * into v_note;
    end if;
    insert into public.note_versions(user_id, note_id, title, body_markdown, version_number,
      created_by, content_hash, revision, reason)
    values(v_user, v_note.id, v_note.title, v_note.body_markdown, v_snapshot_version,
      v_user, v_body_hash, v_note.revision, case when v_operation = 'note.create' then 'external_initial' else 'external_update' end);
    v_result := jsonb_build_object('operationId', v_operation_id, 'entityType', 'note',
      'entityId', v_note.id, 'revision', v_note.revision, 'updatedAt', v_note.updated_at,
      'href', '/notes/' || v_note.id::text || '/read', 'replayed', false);
  else
    if jsonb_typeof(p_command->'preparationId') <> 'string'
      or jsonb_typeof(p_command->'answerMode') <> 'string'
      or jsonb_typeof(p_command->'language') <> 'string'
      or jsonb_typeof(p_command->'expectedVersion') <> 'number'
      or (p_command->>'expectedVersion') !~ '^[0-9]+$'
      or jsonb_typeof(p_command->'expectedAnswerId') not in ('string', 'null')
      or jsonb_typeof(p_command->'expectedUpdatedAt') not in ('string', 'null')
      or jsonb_typeof(p_command->'targetSeconds') not in ('number', 'null')
      or (jsonb_typeof(p_command->'targetSeconds') = 'number' and (p_command->>'targetSeconds') !~ '^[0-9]+$')
      or (p_command ? 'changeNote' and jsonb_typeof(p_command->'changeNote') not in ('string', 'null'))
    then
      raise exception using errcode = '22023', message = 'invalid interview command field type';
    end if;
    v_preparation_id := (p_command->>'preparationId')::uuid;
    v_mode := p_command->>'answerMode';
    v_language := p_command->>'language';
    v_seconds := (p_command->>'targetSeconds')::integer;
    v_expected_version := (p_command->>'expectedVersion')::integer;
    v_base_answer_id := (p_command->>'expectedAnswerId')::uuid;
    v_expected_updated_at := (p_command->>'expectedUpdatedAt')::timestamptz;
    v_change_note := p_command->>'changeNote';
    if v_mode <> 'spoken' or v_language not in ('zh', 'en', 'bilingual')
      or (v_seconds is not null and v_seconds not between 10 and 1800)
      or v_expected_version > 2147483646
      or ((v_base_answer_id is null) <> (v_expected_updated_at is null))
      or (v_expected_version = 0 and v_base_answer_id is not null)
      or (v_expected_updated_at is not null and not isfinite(v_expected_updated_at))
      or char_length(btrim(v_body)) = 0 or char_length(v_body) > 50000
      or (v_change_note is not null and char_length(v_change_note) > 4000)
    then
      raise exception using errcode = '22023', message = 'invalid interview command values';
    end if;
    -- The stable parent is locked, so all adapter writes to its streams serialize.
    select * into v_preparation from public.interview_question_preparations p
      where p.id = v_preparation_id and p.user_id = v_user and p.archived_at is null for update;
    if not found or not exists (
      select 1 from public.interview_questions q where q.id = v_preparation.question_id
        and q.user_id = v_user and q.archived_at is null
    ) then
      raise exception using errcode = 'P0103', message = 'selected preparation unavailable';
    end if;
    if v_preparation.context_id is not null and not exists (
      select 1 from public.interview_contexts c where c.id = v_preparation.context_id
        and c.user_id = v_user and c.archived_at is null
    ) then
      raise exception using errcode = 'P0103', message = 'selected context unavailable';
    end if;
    select coalesce(max(a.version_number), 0) into v_latest_version from public.interview_answer_versions a
      where a.user_id = v_user and a.preparation_id = v_preparation_id and a.answer_mode = v_mode
        and a.language = v_language and a.target_seconds is not distinct from v_seconds;
    if v_latest_version <> v_expected_version then
      raise exception using errcode = 'P0101', message = 'answer variant changed since it was read';
    end if;
    if v_base_answer_id is not null then
      select * into v_answer from public.interview_answer_versions a
        where a.id = v_base_answer_id and a.user_id = v_user and a.preparation_id = v_preparation_id
          and a.answer_mode = v_mode and a.language = v_language and a.target_seconds is not distinct from v_seconds
          and a.archived_at is null and a.status in ('draft', 'current') for update;
      if not found then
        raise exception using errcode = 'P0103', message = 'selected answer unavailable';
      end if;
      if v_answer.updated_at <> v_expected_updated_at then
        raise exception using errcode = 'P0101', message = 'base answer changed since it was read';
      end if;
    end if;
    -- Never rewrite a historical answer, retire a current version, set confirmed_at,
    -- or claim readiness/practice on behalf of an external drafting agent.
    insert into public.interview_answer_versions(user_id, preparation_id, answer_mode, language,
      target_seconds, body_markdown, version_number, source, status, change_note, confirmed_at)
    values(v_user, v_preparation_id, v_mode, v_language, v_seconds, v_body, v_latest_version + 1,
      case when v_base_answer_id is null then 'ai_draft' else 'ai_edited' end, 'draft', v_change_note, null)
    returning * into v_answer;
    v_before := jsonb_build_object('answerId', v_base_answer_id, 'version', v_expected_version, 'updatedAt', v_expected_updated_at);
    v_result := jsonb_build_object('operationId', v_operation_id, 'entityType', 'interview_preparation',
      'entityId', v_preparation_id, 'answerId', v_answer.id, 'revision', v_answer.version_number,
      'updatedAt', v_answer.updated_at, 'href', '/career/interview?question=' || v_preparation.question_id::text
        || '&answer=' || v_answer.id::text
        || case when v_preparation.context_id is null then '' else '&context=' || v_preparation.context_id::text end,
      'replayed', false);
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, actor_type, request_id, before_data, after_data)
  values(v_user, 'content.write', v_result->>'entityType', (v_result->>'entityId')::uuid, 'external_agent',
    v_operation_id, v_before, jsonb_build_object('commandHash', v_hash, 'operation', v_operation,
      'source', v_source, 'sourceUrl', v_source_url, 'contentOrigin', v_content_origin, 'captureMode', v_capture_mode, 'result', v_result));
  return v_result;
end;
$function$;

revoke all on function public.write_content(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.write_content(jsonb) to authenticated;

comment on function public.write_content(jsonb) is
  'Owner-JWT content writes: atomic retained history, optimistic concurrency, and audit-backed replay. External interview answers are unconfirmed drafts.';

commit;
