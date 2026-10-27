begin;
-- New synthetic owners need the same used taxonomy entries as the real registry;
-- the historical migration only backfilled owners with existing questions.
insert into public.interview_question_types(id,user_id,key,label,position) values('b1100000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000001','behavioral','行为',20);
insert into public.interview_formats(id,user_id,key,label,participant_mode,position) values('b1100000-0000-4000-8000-000000000011','81000000-0000-4000-8000-000000000001','one_to_one','1v1','individual',10);
insert into public.interview_questions(id,user_id,canonical_prompt,category,source_type,question_type_id) values('b1100000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Synthetic original prompt','behavioral','manual','b1100000-0000-4000-8000-000000000010');
insert into public.interview_contexts(id,user_id,title,context_type) values('b1100000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','Synthetic target','general');
insert into public.interview_question_preparations(id,user_id,question_id,context_id) values('b1100000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000002');
insert into public.interview_sessions(id,user_id,context_id,title,session_kind,format_id) values('b1100000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000002','Synthetic session','mock','b1100000-0000-4000-8000-000000000011');
set local role authenticated;set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$begin
 assert exists(select 1 from public.interview_questions q join public.interview_question_types t on (t.user_id,t.id)=(q.user_id,q.question_type_id) join public.interview_question_archetypes a on (a.user_id,a.id)=(q.user_id,q.archetype_id) where q.id='b1100000-0000-4000-8000-000000000001' and q.user_id='81000000-0000-4000-8000-000000000001' and t.key='behavioral' and a.primary_question_type_id=t.id), 'synthetic question taxonomy or trigger-created archetype mismatch';
 assert exists(select 1 from public.interview_sessions s join public.interview_formats f on (f.user_id,f.id)=(s.user_id,s.format_id) where s.id='b1100000-0000-4000-8000-000000000004' and s.user_id='81000000-0000-4000-8000-000000000001' and f.key='one_to_one'), 'synthetic session format mismatch';
end $$;
do $$
declare payload jsonb:='{"mode":"solo","preparation_id":"b1100000-0000-4000-8000-000000000003","session_id":null,"parent_attempt_id":null,"answer_version_id":null,"story_id":null,"input_mode":"text","language":"zh","prompt_snapshot":"Synthetic original prompt","response_transcript_markdown":"  Synthetic raw transcript  ","duration_seconds":null,"self_review_markdown":"","strength_tags":[],"issue_tags":["structure","clarity"],"next_focus":"Next focus","confidence_before":null,"confidence_after":null}'; receipt jsonb; scheduled timestamptz; first uuid:='b1200000-0000-4000-8000-000000000001';
begin
 receipt:=public.record_interview_practice_intent(first,payload); assert receipt->>'created'='true';
 select next_practice_at into scheduled from public.interview_question_preparations where id='b1100000-0000-4000-8000-000000000003';
 assert scheduled is not null;
 assert(select response_transcript_markdown='  Synthetic raw transcript  ' and submission_fingerprint is not null from public.interview_practice_attempts where id=first);
 receipt:=public.record_interview_practice_intent(first,payload);assert receipt->>'created'='false';
 assert(select next_practice_at=scheduled from public.interview_question_preparations where id='b1100000-0000-4000-8000-000000000003');
 assert(select count(*)=1 from public.audit_logs where entity_id=first and action='practice');
 assert public.reconcile_interview_practice_intent(first,payload)->>'status'='saved';
 assert public.reconcile_interview_practice_intent(first,payload||'{"next_focus":"changed"}')->>'status'='conflict';
 begin perform public.record_interview_practice_intent(first,payload||'{"next_focus":"changed"}');raise exception 'TEST changed practice payload replay';exception when serialization_failure then null;end;
 begin update public.interview_practice_attempts set response_transcript_markdown='forged' where id=first;raise exception 'TEST original intent changed';exception when check_violation then if sqlerrm<>'practice_submission_immutable' then raise;end if;end;
 begin update public.interview_practice_attempts set submission_fingerprint=repeat('a',64) where id=first;raise exception 'TEST provenance changed';exception when check_violation then if sqlerrm<>'practice_submission_immutable' then raise;end if;end;
 payload:=payload||'{"mode":"session","session_id":"b1100000-0000-4000-8000-000000000004"}';
 receipt:=public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000002',payload);assert (receipt->>'sequence_no')::integer=1;
 assert(select status='in_progress' and started_at is not null from public.interview_sessions where id='b1100000-0000-4000-8000-000000000004');
 update public.interview_practice_attempts set archived_at=now() where id='b1200000-0000-4000-8000-000000000002';
 receipt:=public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000003',payload);assert (receipt->>'sequence_no')::integer=2;
 assert public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000002',payload)->>'archived'='true';
 begin perform public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000004',payload||jsonb_build_object('parent_attempt_id',first));raise exception 'TEST solo parent in session accepted';exception when check_violation then null;end;
 begin perform public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000005',payload||jsonb_build_object('issue_tags',jsonb_build_array(repeat('🌱',2001))));raise exception 'TEST UTF16 tag budget exceeded';exception when invalid_parameter_value then null;end;
end $$;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
do $$begin
 assert not exists(select 1 from public.interview_practice_attempts where id='b1200000-0000-4000-8000-000000000001');
 assert public.reconcile_interview_practice_intent('b1200000-0000-4000-8000-000000000001','{}')->>'status'='missing';
end $$;
reset role;
do $$begin assert not has_function_privilege('anon','public.record_interview_practice_intent(uuid,jsonb)','EXECUTE');assert not has_function_privilege('anon','public.reconcile_interview_practice_intent(uuid,jsonb)','EXECUTE');end $$;
create function public.synthetic_practice_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_practice_audit_failure';end $$;
create trigger synthetic_practice_audit_failure before insert on public.audit_logs for each row when(new.action='practice') execute function public.synthetic_practice_audit_failure();
set local role authenticated;set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$declare original timestamptz; payload jsonb:='{"mode":"solo","preparation_id":"b1100000-0000-4000-8000-000000000003","session_id":null,"parent_attempt_id":null,"answer_version_id":null,"story_id":null,"input_mode":"text","language":"zh","prompt_snapshot":null,"response_transcript_markdown":"Atomic failed save","duration_seconds":null,"self_review_markdown":"","strength_tags":[],"issue_tags":[],"next_focus":"Must roll back","confidence_before":null,"confidence_after":null}';begin
 select next_practice_at into original from public.interview_question_preparations where id='b1100000-0000-4000-8000-000000000003';
 begin perform public.record_interview_practice_intent('b1200000-0000-4000-8000-000000000006',payload);raise exception 'TEST failed audit accepted';exception when raise_exception then if sqlerrm<>'synthetic_practice_audit_failure' then raise;end if;end;
 assert not exists(select 1 from public.interview_practice_attempts where id='b1200000-0000-4000-8000-000000000006');
 assert(select next_practice_at=original and next_focus='Next focus' from public.interview_question_preparations where id='b1100000-0000-4000-8000-000000000003');
end $$;
rollback;
