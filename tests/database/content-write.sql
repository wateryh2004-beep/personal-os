-- Executable PostgreSQL assertions. No pgTAP extension/install is required.
-- Prerequisites: an isolated Personal OS schema and reviewed write_content RPC.
-- Local entry point: scripts/test-content-database.mjs (loopback + opt-in only).
-- All fixtures, trigger/function DDL, content, snapshots, and receipts roll back.
-- This file contains no COMMIT and never reads or changes existing user content.
-- Two-session concurrency is a separate pending check: see the runner's --help.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local client_min_messages = warning;

create function pg_temp.content_assert(ok boolean, label text) returns void
language plpgsql security invoker as $$
begin
  if ok is distinct from true then
    raise exception 'CONTENT TEST FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.content_expect_error(command jsonb, expected text) returns void
language plpgsql security invoker as $$
declare actual text;
begin
  begin
    perform public.write_content(command);
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
  end;
  if actual is distinct from expected then
    raise exception 'CONTENT TEST FAILED: expected SQLSTATE %, got %', expected, coalesce(actual, 'success');
  end if;
end;
$$;

-- Reject one synthetic audit receipt after content/history were written. The
-- surrounding RPC must roll them all back. This trigger is itself rolled back.
create function public.content_test_reject_receipt() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.action = 'content.write' and new.request_id::text = current_setting('content_test.fail_operation', true) then
    raise exception using errcode = '23514', message = 'synthetic receipt failure';
  end if;
  return new;
end;
$$;
create trigger content_test_reject_receipt before insert on public.audit_logs
for each row execute function public.content_test_reject_receipt();

do $tests$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  question_a uuid := gen_random_uuid();
  question_b uuid := gen_random_uuid();
  preparation_a uuid := gen_random_uuid();
  preparation_b uuid := gen_random_uuid();
  folder_b uuid := gen_random_uuid();
  note_a uuid;
  op_create uuid := gen_random_uuid();
  op_update uuid := gen_random_uuid();
  op_failure uuid := gen_random_uuid();
  create_command jsonb;
  update_command jsonb;
  answer_command jsonb;
  result_create jsonb;
  result_update jsonb;
  answer_one jsonb;
  answer_two jsonb;
  result_replay jsonb;
  result_b jsonb;
  answer_b jsonb;
  result_new jsonb;
  original_markdown text := E'\n# Exact source\n\n  preserve these spaces  \n';
  updated_markdown text := E'\n# Revised source\n\n  still exact  \n';
  touched integer;
  snapshots_before bigint;
  receipts_before bigint;
  notes_before bigint;
  before_body text;
  before_revision integer;
  before_updated timestamptz;
begin
  perform pg_temp.content_assert(to_regprocedure('public.write_content(jsonb)') is not null, 'RPC installed');
  perform pg_temp.content_assert(not (select prosecdef from pg_proc where oid = 'public.write_content(jsonb)'::regprocedure), 'RPC is SECURITY INVOKER');
  perform pg_temp.content_assert(has_function_privilege('authenticated', 'public.write_content(jsonb)', 'execute'), 'authenticated execute grant');
  perform pg_temp.content_assert(not has_function_privilege('anon', 'public.write_content(jsonb)', 'execute'), 'anonymous has no execute grant');
  perform pg_temp.content_assert(not has_function_privilege('service_role', 'public.write_content(jsonb)', 'execute'), 'service role has no execute grant');

  -- auth.users required columns were verified: only id has no default. Email
  -- and raw_user_meta_data support the existing profile trigger; no passwords.
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_a, 'content-test-' || owner_a::text || '@example.invalid', '{}'::jsonb),
    (owner_b, 'content-test-' || owner_b::text || '@example.invalid', '{}'::jsonb);
  -- V1.1 has no taxonomy; current migrations require a per-owner type registry.
  if to_regclass('public.interview_question_types') is not null then
    execute 'insert into public.interview_question_types(user_id,key,label) values ($1,''behavioral'',''Synthetic test''),($2,''behavioral'',''Synthetic test'')' using owner_a, owner_b;
  end if;
  insert into public.interview_questions(id,user_id,canonical_prompt,category) values
    (question_a,owner_a,'Synthetic owner A question','behavioral'),
    (question_b,owner_b,'Synthetic owner B question','behavioral');
  insert into public.interview_question_preparations(id,user_id,question_id) values
    (preparation_a,owner_a,question_a), (preparation_b,owner_b,question_b);
  insert into public.note_folders(id,user_id,name) values(folder_b,owner_b,'Synthetic private folder');

  create_command := jsonb_build_object('operation','note.create','operationId',op_create,
    'source','codex','sourceUrl','https://chatgpt.com/c/synthetic-example','contentOrigin','human','captureMode','original','title','Synthetic selected note',
    'bodyMarkdown',original_markdown,'folderId',null);
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  perform pg_temp.content_expect_error(create_command,'42501');
  execute 'set local role authenticated';
  perform pg_temp.content_assert(current_user='authenticated','test role cannot bypass RLS');
  perform pg_temp.content_expect_error(create_command,'42501');

  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  perform pg_temp.content_assert(auth.uid()=owner_a,'owner A JWT identity');
  perform pg_temp.content_assert(row_security_active('public.notes'),'notes RLS active');
  result_create := public.write_content(create_command);
  note_a := (result_create->>'entityId')::uuid;
  perform pg_temp.content_assert(result_create->>'revision'='1','initial note revision');
  perform pg_temp.content_assert((select body_markdown=original_markdown and user_id=owner_a and content_origin='human' from public.notes where id=note_a),'exact human Markdown, explicit authorship, and derived owner');
  perform pg_temp.content_assert((select count(*)=1 from public.note_versions where note_id=note_a),'initial snapshot retained');
  perform pg_temp.content_assert((select after_data->>'sourceUrl'='https://chatgpt.com/c/synthetic-example' from public.audit_logs where request_id=op_create),'provenance stored separately');
  perform pg_temp.content_assert((select after_data->>'captureMode'='original' and after_data->>'contentOrigin'='human' from public.audit_logs where request_id=op_create),'capture mode and authorship separate from transport');
  perform pg_temp.content_expect_error((create_command - 'contentOrigin') || jsonb_build_object('operationId',gen_random_uuid()),'22023');
  result_replay := public.write_content(create_command);
  perform pg_temp.content_assert(result_replay=result_create || '{"replayed":true}'::jsonb,'exact replay returns same result');
  perform pg_temp.content_assert((select count(*)=1 from public.notes),'replay does not duplicate notes');
  perform pg_temp.content_assert((select count(*)=1 from public.note_versions where note_id=note_a),'replay does not duplicate snapshots');
  perform pg_temp.content_assert((select count(*)=1 from public.audit_logs where request_id=op_create),'replay does not duplicate receipts');
  perform pg_temp.content_expect_error(create_command || '{"bodyMarkdown":"different payload"}'::jsonb,'P0102');
  perform pg_temp.content_expect_error(create_command || jsonb_build_object('operationId',gen_random_uuid(),'user_id',owner_b),'22023');
  perform pg_temp.content_expect_error(create_command || jsonb_build_object('operationId',gen_random_uuid(),'folderId',folder_b),'P0103');

  update_command := jsonb_build_object('operation','note.update','operationId',op_update,'source','claude','sourceUrl',null,'contentOrigin','ai_generated','captureMode','curated',
    'noteId',note_a,'expectedRevision',1,'expectedUpdatedAt',result_create->>'updatedAt','title','Synthetic revision','bodyMarkdown',updated_markdown);
  result_update := public.write_content(update_command);
  perform pg_temp.content_assert((select before_data->>'contentOrigin'='human' and after_data->>'contentOrigin'='ai_generated' and after_data->>'captureMode'='curated' from public.audit_logs where request_id=op_update),'authorship change retains prior origin in audit');
  perform pg_temp.content_assert(result_update->>'entityId'=note_a::text and result_update->>'revision'='2','same note identity with incremented revision');
  perform pg_temp.content_assert((select body_markdown=updated_markdown and content_origin='ai_generated' from public.notes where id=note_a),'updated bytes exact and authorship explicitly changed');
  perform pg_temp.content_assert((select count(*)=3 from public.note_versions where note_id=note_a),'before and after snapshots retained');
  perform pg_temp.content_assert((select body_markdown=original_markdown from public.note_versions where note_id=note_a and version_number=2),'prior body survives');
  perform pg_temp.content_assert((select body_markdown=updated_markdown from public.note_versions where note_id=note_a and version_number=3),'new snapshot matches canonical');
  perform pg_temp.content_expect_error(update_command || jsonb_build_object('operationId',gen_random_uuid()),'P0101');
  perform pg_temp.content_expect_error(update_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',2,'expectedUpdatedAt',((result_update->>'updatedAt')::timestamptz-interval '1 second')),'P0101');
  update public.notes set ai_visibility='sensitive' where id=note_a;
  perform pg_temp.content_expect_error(update_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',2,'expectedUpdatedAt',(select updated_at from public.notes where id=note_a)),'P0103');
  update public.notes set ai_visibility='never' where id=note_a;
  perform pg_temp.content_expect_error(update_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',2,'expectedUpdatedAt',(select updated_at from public.notes where id=note_a)),'P0103');
  update public.notes set ai_visibility='normal' where id=note_a;

  -- Owner B cannot read/update A, reuse A's receipt, or append into A's preparation.
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  perform pg_temp.content_assert((select count(*)=0 from public.notes where id=note_a),'owner B cannot read A');
  update public.notes set title='forbidden' where id=note_a;
  get diagnostics touched = row_count;
  perform pg_temp.content_assert(touched=0,'owner B cannot directly update A');
  perform pg_temp.content_expect_error(update_command,'P0103');
  result_b := public.write_content(create_command);
  perform pg_temp.content_assert(result_b->>'entityId'<>note_a::text and result_b->>'replayed'='false','operation IDs are owner scoped');
  answer_command := jsonb_build_object('operation','interview.answer.append','operationId',gen_random_uuid(),'source','codex','sourceUrl',null,
    'preparationId',preparation_a,'answerMode','spoken','language','zh','targetSeconds',null,
    'expectedVersion',0,'expectedAnswerId',null,'expectedUpdatedAt',null,'bodyMarkdown',E'  Synthetic spoken answer\n','changeNote',null);
  perform pg_temp.content_expect_error(answer_command,'P0103');
  answer_b := public.write_content(answer_command || jsonb_build_object('preparationId',preparation_b));

  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  answer_one := public.write_content(answer_command);
  perform pg_temp.content_assert(answer_one->>'entityId'=preparation_a::text,'stable preparation identity');
  perform pg_temp.content_assert((select status='draft' and source='ai_draft' and confirmed_at is null and body_markdown=E'  Synthetic spoken answer\n' from public.interview_answer_versions where id=(answer_one->>'answerId')::uuid),'first external answer stays exact unconfirmed draft');
  perform pg_temp.content_assert(public.write_content(answer_command)=answer_one || '{"replayed":true}'::jsonb,'answer replay stable');
  -- Simulate an explicit owner confirmation, then ensure an external edit never retires it.
  update public.interview_answer_versions set status='current',confirmed_at=now() where id=(answer_one->>'answerId')::uuid;
  answer_command := answer_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',1,'expectedAnswerId',answer_one->>'answerId',
    'expectedUpdatedAt',(select updated_at from public.interview_answer_versions where id=(answer_one->>'answerId')::uuid),'bodyMarkdown','Revised synthetic answer');
  answer_two := public.write_content(answer_command);
  perform pg_temp.content_assert(answer_two->>'revision'='2' and answer_two->>'answerId'<>answer_one->>'answerId','answer appends a distinct row');
  perform pg_temp.content_assert((select status='current' and body_markdown=E'  Synthetic spoken answer\n' from public.interview_answer_versions where id=(answer_one->>'answerId')::uuid),'confirmed original remains current and unchanged');
  perform pg_temp.content_assert((select status='draft' and source='ai_edited' and confirmed_at is null from public.interview_answer_versions where id=(answer_two->>'answerId')::uuid),'revision stays unconfirmed AI draft');
  perform pg_temp.content_assert((select count(*)=0 from public.interview_practice_attempts where preparation_id=preparation_a),'authoring creates no practice records');
  perform pg_temp.content_expect_error(answer_command || jsonb_build_object('operationId',gen_random_uuid()),'P0101');
  perform pg_temp.content_expect_error(answer_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'expectedUpdatedAt',now()-interval '1 second'),'P0101');
  perform pg_temp.content_expect_error(answer_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'expectedAnswerId',answer_b->>'answerId'),'P0103');
  perform pg_temp.content_expect_error(answer_command || jsonb_build_object('operationId',gen_random_uuid(),'answerMode','outline'),'22023');
  perform pg_temp.content_expect_error(answer_command || jsonb_build_object('operationId',gen_random_uuid(),'status','current'),'22023');
  update public.interview_answer_versions set status='retired',archived_at=now() where preparation_id=preparation_a;
  result_new := public.write_content(answer_command || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'expectedAnswerId',null,'expectedUpdatedAt',null));
  perform pg_temp.content_assert(result_new->>'revision'='3','archived-only stream can receive new draft');
  perform pg_temp.content_assert((select count(*)=2 from public.interview_answer_versions where preparation_id=preparation_a and archived_at is not null),'archived history not revived');

  -- Force the final receipt insert to fail, after the note/history work ran.
  select count(*) into snapshots_before from public.note_versions where note_id=note_a;
  select count(*) into receipts_before from public.audit_logs;
  select body_markdown,revision,updated_at into before_body,before_revision,before_updated from public.notes where id=note_a;
  perform set_config('content_test.fail_operation',op_failure::text,true);
  perform pg_temp.content_expect_error(update_command || jsonb_build_object('operationId',op_failure,'expectedRevision',before_revision,'expectedUpdatedAt',before_updated,'bodyMarkdown','Must roll back'),'23514');
  perform pg_temp.content_assert((select body_markdown=before_body and revision=before_revision and updated_at=before_updated from public.notes where id=note_a),'failed receipt rolls canonical update back');
  perform pg_temp.content_assert((select count(*)=snapshots_before from public.note_versions where note_id=note_a),'failed receipt rolls snapshots back');
  perform pg_temp.content_assert((select count(*)=receipts_before from public.audit_logs),'failed receipt leaves no receipt');
  select count(*) into notes_before from public.notes;
  perform pg_temp.content_expect_error(create_command || jsonb_build_object('operationId',op_failure),'23514');
  perform pg_temp.content_assert((select count(*)=notes_before from public.notes),'failed create leaves no orphan note');
  perform set_config('content_test.fail_operation','',true);
  execute 'reset role';
end;
$tests$;

rollback;
select 'PASS: content owner/RLS, exact replay, payload binding, note CAS/history, interview drafts/base CAS, and receipt-failure rollback; all fixtures rolled back' as verification;
