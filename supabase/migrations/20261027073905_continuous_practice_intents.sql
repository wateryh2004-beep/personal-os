-- Atomic practice intent, original transcript and append-only provenance.
alter table public.interview_practice_attempts add column submission_fingerprint text
  check (submission_fingerprint is null or submission_fingerprint ~ '^[0-9a-f]{64}$');

create function workflow_private.guard_practice_submission() returns trigger
language plpgsql set search_path='' as $$
declare k text;
begin
 if tg_op='INSERT' then
  if new.submission_fingerprint is not null and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'practice_submission_server_managed' using errcode='42501';end if;
  return new;
 end if;
 if old.submission_fingerprint is null and new.submission_fingerprint is not null then raise exception 'practice_submission_cannot_be_adopted' using errcode='42501';end if;
 if old.submission_fingerprint is not null then
  foreach k in array array['id','user_id','created_at','practiced_at','submission_fingerprint','preparation_id','session_id','answer_version_id','parent_attempt_id','story_id','attempt_kind','input_mode','language','prompt_snapshot','response_transcript_markdown','duration_seconds','self_review_markdown','strength_tags','issue_tags','next_focus','confidence_before','confidence_after','sequence_no'] loop
   if to_jsonb(new)->k is distinct from to_jsonb(old)->k then raise exception 'practice_submission_immutable' using errcode='23514'; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function workflow_private.guard_practice_submission() from public,anon,authenticated,service_role;
create trigger practice_submission_immutable before insert or update on public.interview_practice_attempts
for each row execute function workflow_private.guard_practice_submission();

-- Payload is server-normalized using the original schemas, and independently
-- checked again here. No model/provider call or browser-supplied owner.
create function public.record_interview_practice_intent(p_attempt_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid(); fingerprint text; v public.interview_practice_attempts;
 existing public.interview_practice_attempts; prep public.interview_question_preparations;
 sess public.interview_sessions; parent public.interview_practice_attempts;
 mode text; k text; qid uuid; resolved_prompt text; next_sequence integer;
begin
 if owner_id is null or p_attempt_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'practice_invalid' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_payload))<>17 or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('mode','preparation_id','session_id','parent_attempt_id','answer_version_id','story_id','input_mode','language','prompt_snapshot','response_transcript_markdown','duration_seconds','self_review_markdown','strength_tags','issue_tags','next_focus','confidence_before','confidence_after')) then raise exception 'practice_invalid' using errcode='22023'; end if;
 foreach k in array array['mode','input_mode','language','response_transcript_markdown','self_review_markdown','next_focus'] loop
  if jsonb_typeof(p_payload->k) is distinct from 'string' then raise exception 'practice_invalid' using errcode='22023'; end if;
 end loop;
 foreach k in array array['preparation_id','session_id','parent_attempt_id','answer_version_id','story_id','prompt_snapshot'] loop
  if jsonb_typeof(p_payload->k) not in ('string','null') then raise exception 'practice_invalid' using errcode='22023'; end if;
 end loop;
 foreach k in array array['duration_seconds','confidence_before','confidence_after'] loop
  if jsonb_typeof(p_payload->k) not in ('number','null') or (jsonb_typeof(p_payload->k)='number' and (p_payload->>k)!~'^[0-9]+$') then raise exception 'practice_invalid' using errcode='22023'; end if;
 end loop;
 foreach k in array array['strength_tags','issue_tags'] loop
  if jsonb_typeof(p_payload->k) is distinct from 'array' or jsonb_array_length(p_payload->k)>32 or exists(select 1 from jsonb_array_elements(p_payload->k) x where jsonb_typeof(x)<>'string' or private.inbox_ai_utf16_length(x #>> '{}')>4000) or (select coalesce(sum(private.inbox_ai_utf16_length(x #>> '{}')),0)+greatest(count(*)-1,0) from jsonb_array_elements(p_payload->k) x)>4000 then raise exception 'practice_invalid' using errcode='22023'; end if;
 end loop;
 mode:=p_payload->>'mode';
 if mode not in ('solo','session') or (p_payload->>'input_mode') not in ('text','voice','transcript_import') or (p_payload->>'language') not in ('zh','en','bilingual') or private.inbox_ai_utf16_length(p_payload->>'response_transcript_markdown')>100000 or private.inbox_ai_utf16_length(p_payload->>'self_review_markdown')>50000 or private.inbox_ai_utf16_length(p_payload->>'next_focus')>5000 or private.inbox_ai_utf16_length(coalesce(p_payload->>'prompt_snapshot',''))>10000 then raise exception 'practice_invalid' using errcode='22023'; end if;
 v:=jsonb_populate_record(null::public.interview_practice_attempts,p_payload-'mode');
 if (v.duration_seconds is not null and v.duration_seconds not between 1 and 7200) or (v.confidence_before is not null and v.confidence_before not between 1 and 5) or (v.confidence_after is not null and v.confidence_after not between 1 and 5) or (mode='solo' and (v.preparation_id is null or v.session_id is not null)) or (mode='session' and (v.session_id is null or v.answer_version_id is not null)) then raise exception 'practice_invalid' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 -- A stable intent lock serializes two retries even when their parent differs;
 -- parent rows then serialize different intents sharing the session/preparation.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':practice:'||p_attempt_id::text,0));
 select * into existing from public.interview_practice_attempts where id=p_attempt_id and user_id=owner_id;
 if found then
  if existing.submission_fingerprint is distinct from fingerprint or row(existing.preparation_id,existing.session_id,existing.parent_attempt_id,existing.answer_version_id,existing.story_id,existing.input_mode,existing.language,existing.response_transcript_markdown,existing.duration_seconds,existing.self_review_markdown,existing.strength_tags,existing.issue_tags,existing.next_focus,existing.confidence_before,existing.confidence_after) is distinct from row(v.preparation_id,v.session_id,v.parent_attempt_id,v.answer_version_id,v.story_id,v.input_mode,v.language,v.response_transcript_markdown,v.duration_seconds,v.self_review_markdown,v.strength_tags,v.issue_tags,v.next_focus,v.confidence_before,v.confidence_after) or (nullif(btrim(v.prompt_snapshot),'') is not null and existing.prompt_snapshot is distinct from btrim(v.prompt_snapshot)) then raise exception 'practice_intent_conflict' using errcode='40001'; end if;
  return jsonb_build_object('attempt_id',existing.id,'preparation_id',existing.preparation_id,'session_id',existing.session_id,'sequence_no',existing.sequence_no,'created',false,'archived',existing.archived_at is not null);
 end if;
 if v.session_id is not null then
  select * into sess from public.interview_sessions where id=v.session_id and user_id=owner_id and archived_at is null for update;
  if not found or sess.status not in ('planned','in_progress') then raise exception 'practice_session_missing' using errcode='23514'; end if;
 end if;
 if v.preparation_id is not null then
  select * into prep from public.interview_question_preparations where id=v.preparation_id and user_id=owner_id and archived_at is null for update;
  if not found then raise exception 'practice_preparation_missing' using errcode='23514'; end if;
  qid:=prep.question_id;
  if v.session_id is not null and sess.context_id is distinct from prep.context_id then raise exception 'practice_context_mismatch' using errcode='23514'; end if;
 end if;
 if v.parent_attempt_id is not null then
  select * into parent from public.interview_practice_attempts where id=v.parent_attempt_id and user_id=owner_id and archived_at is null;
  if not found or parent.preparation_id is distinct from v.preparation_id or parent.session_id is distinct from v.session_id then raise exception 'practice_parent_mismatch' using errcode='23514'; end if;
 end if;
 if v.answer_version_id is not null and not exists(select 1 from public.interview_answer_versions where id=v.answer_version_id and user_id=owner_id and preparation_id=v.preparation_id and archived_at is null) then raise exception 'practice_answer_missing' using errcode='23514'; end if;
 if v.story_id is not null and not exists(select 1 from public.interview_stories where id=v.story_id and user_id=owner_id and archived_at is null) then raise exception 'practice_story_missing' using errcode='23514'; end if;
 resolved_prompt:=nullif(btrim(v.prompt_snapshot),'');
 if resolved_prompt is null and mode='solo' then
  select coalesce(nullif(btrim(prep.prompt_override),''),nullif(btrim(q.canonical_prompt),'')) into resolved_prompt from public.interview_questions q where q.id=prep.question_id and q.user_id=owner_id and q.archived_at is null;
 end if;
 if resolved_prompt is null or private.inbox_ai_utf16_length(resolved_prompt)>10000 then raise exception 'practice_prompt_missing' using errcode='23514'; end if;
 if mode='session' then
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.interview_practice_attempts where session_id=v.session_id and user_id=owner_id;
  if sess.status='planned' then update public.interview_sessions set status='in_progress',started_at=coalesce(started_at,now()) where id=sess.id and user_id=owner_id; end if;
 end if;
 insert into public.interview_practice_attempts(id,user_id,preparation_id,session_id,answer_version_id,parent_attempt_id,story_id,sequence_no,attempt_kind,input_mode,language,prompt_snapshot,response_transcript_markdown,duration_seconds,self_review_markdown,feedback_markdown,feedback_source,strength_tags,issue_tags,next_focus,confidence_before,confidence_after,metrics,submission_fingerprint)
 values(p_attempt_id,owner_id,v.preparation_id,v.session_id,v.answer_version_id,v.parent_attempt_id,v.story_id,next_sequence,case when mode='solo' then 'solo' else sess.session_kind end,v.input_mode,v.language,resolved_prompt,v.response_transcript_markdown,v.duration_seconds,v.self_review_markdown,'','self',v.strength_tags,v.issue_tags,v.next_focus,v.confidence_before,v.confidence_after,'{}',fingerprint);
 if mode='solo' then update public.interview_question_preparations set next_practice_at=now()+interval '72 hours',next_focus=case when btrim(v.next_focus)<>'' then v.next_focus else next_focus end,status=case when status in ('unprepared','developing') then 'practicing' else status end where id=v.preparation_id and user_id=owner_id; end if;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,'practice','interview_attempt',p_attempt_id,'user',jsonb_build_object('preparation_id',v.preparation_id,'session_id',v.session_id,'sequence_no',next_sequence));
 return jsonb_build_object('attempt_id',p_attempt_id,'preparation_id',v.preparation_id,'session_id',v.session_id,'sequence_no',next_sequence,'question_id',qid,'created',true,'archived',false);
end $$;
revoke all on function public.record_interview_practice_intent(uuid,jsonb) from public,anon,service_role;
grant execute on function public.record_interview_practice_intent(uuid,jsonb) to authenticated;

-- Pure read-back: no claim/INSERT/audit/schedule. Input must remain the exact
-- frozen normalized intent. The server never sends transcript contents back.
create function public.reconcile_interview_practice_intent(p_attempt_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.interview_practice_attempts; owner_id uuid:=auth.uid();
begin
 if owner_id is null or p_attempt_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>1000000 then raise exception 'practice_invalid' using errcode='22023'; end if;
 select * into r from public.interview_practice_attempts where id=p_attempt_id and user_id=owner_id;
 if not found then return jsonb_build_object('status','missing'); end if;
 if r.submission_fingerprint is distinct from encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then return jsonb_build_object('status','conflict'); end if;
 return jsonb_build_object('status','saved','attempt_id',r.id,'preparation_id',r.preparation_id,'session_id',r.session_id,'sequence_no',r.sequence_no,'archived',r.archived_at is not null);
end $$;
revoke all on function public.reconcile_interview_practice_intent(uuid,jsonb) from public,anon,service_role;
grant execute on function public.reconcile_interview_practice_intent(uuid,jsonb) to authenticated;
