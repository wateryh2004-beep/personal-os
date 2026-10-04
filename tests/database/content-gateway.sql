-- ISOLATED DATABASE ACCEPTANCE TESTS ONLY. Prepared; never run on production.
-- Requires reviewed canonical write_content plus the gateway proposal, applied
-- only to a disposable local database after the parent approves its object list.
-- The operator must independently verify the disposable database, then set the
-- session GUC content_gateway.test_database='isolated' before loading this file.
-- All synthetic users, grants, tokens, and content below roll back. No raw
-- production credentials, passwords, or owner data are read or provisioned.
-- Concurrency acceptance is separate: two sessions must prove exactly one code
-- consumption and issuance, and revocation waits for an in-flight content call
-- then rejects later calls. This single-session file does not claim that proof.

begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local client_min_messages=warning;

do $isolated_only$
begin
  if current_setting('content_gateway.test_database',true) is distinct from 'isolated' then
    raise exception 'Refusing gateway tests without independently verified isolated database';
  end if;
end;
$isolated_only$;

create function pg_temp.gateway_assert(ok boolean,label text) returns void
language plpgsql security invoker as $$
begin
  if ok is distinct from true then raise exception 'GATEWAY TEST FAILED: %',label; end if;
end;
$$;
create function pg_temp.gateway_expect_error(statement text,expected text) returns void
language plpgsql security invoker as $$
declare actual text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual=returned_sqlstate;
  end;
  if actual is distinct from expected then
    raise exception 'GATEWAY TEST FAILED: expected SQLSTATE %, received %',expected,coalesce(actual,'success');
  end if;
end;
$$;

do $tests$
declare
  owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
  other_note uuid:=gen_random_uuid(); preparation_a uuid:=gen_random_uuid(); question_a uuid:=gen_random_uuid();
  resource text:='https://gateway-test.example.invalid/mcp';
  csrf text:=repeat('a',64); code_hash text:=repeat('b',64); nonce_hash text:=repeat('c',64); token_hash text:=repeat('d',64);
  req jsonb; request_dto jsonb; code_dto jsonb; token_dto jsonb; command jsonb; result jsonb; replay jsonb; read_result jsonb;
  request_id uuid; grant_id uuid; note_id uuid; read_grant uuid; old_claims text; other_updated timestamptz;
  desired_expiry timestamptz; actual_expiry timestamptz; readable_token text:=repeat('7',64);
  baseline integer;
begin
  perform pg_temp.gateway_assert(not exists(select 1 from pg_roles where rolname in ('content_gateway_runtime','content_gateway_auth_owner','content_gateway_executor')
    and (rolcanlogin or rolbypassrls or rolsuper or rolcreatedb or rolcreaterole)),'all gateway roles stay dormant and unprivileged');
  perform pg_temp.gateway_assert(not has_database_privilege('content_gateway_runtime',current_database(),'CREATE,TEMP'),'runtime cannot create schemas or temporary shadow objects');
  perform pg_temp.gateway_assert(not pg_has_role('content_gateway_runtime','authenticated','MEMBER'),'runtime is not authenticated member');
  perform pg_temp.gateway_assert(not pg_has_role('content_gateway_executor','authenticated','MEMBER'),'executor is not authenticated member');
  perform pg_temp.gateway_assert(not has_function_privilege('content_gateway_runtime','public.write_content(jsonb)','EXECUTE'),'runtime cannot invoke canonical writer directly');
  perform pg_temp.gateway_assert(not has_function_privilege('content_gateway_runtime','public.approve_content_authorization(uuid,text,text,text[])','EXECUTE'),'runtime cannot approve grants');
  perform pg_temp.gateway_assert(not has_function_privilege('anon','content_gateway.write_content(text,text,jsonb)','EXECUTE'),'anonymous cannot execute gateway');
  perform pg_temp.gateway_assert(not has_function_privilege('authenticated','content_gateway.write_content(text,text,jsonb)','EXECUTE'),'owner cookie role cannot invoke bearer bridge directly');
  perform pg_temp.gateway_assert(not has_table_privilege('content_gateway_runtime','public.notes','SELECT,INSERT,UPDATE,DELETE'),'runtime has no content-table grants');
  perform pg_temp.gateway_assert(not has_any_column_privilege('content_gateway_runtime','content_auth.tokens','SELECT,INSERT,UPDATE'),'runtime cannot inspect token hashes');
  perform pg_temp.gateway_assert(not (select prosecdef from pg_proc where oid='public.write_content(jsonb)'::regprocedure),'canonical writer remains SECURITY INVOKER');

  -- No actual configured owner/client may be present in this disposable fixture.
  perform pg_temp.gateway_assert((select count(*)=0 from content_auth.clients),'isolated registry starts empty');
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_a,'gateway-test-'||owner_a::text||'@example.invalid','{}'),
    (owner_b,'gateway-test-'||owner_b::text||'@example.invalid','{}');
  insert into content_auth.clients(id,user_id,display_name,redirect_uris,resource,allowed_scopes,enabled)
    values('personalos-codex',owner_a,'Synthetic Codex client',array['http://127.0.0.1/callback'],resource,
      array['notes:read','notes:write','interview:read','interview:append'],true);
  insert into public.notes(id,user_id,title,body_markdown,status,revision,content_origin,ai_visibility)
    values(other_note,owner_b,'Synthetic owner B note','Never expose this fixture','active',1,'human','normal')
    returning updated_at into other_updated;
  if to_regclass('public.interview_question_types') is not null then
    execute 'insert into public.interview_question_types(user_id,key,label) values ($1,''behavioral'',''Synthetic test'')' using owner_a;
  end if;
  insert into public.interview_questions(id,user_id,canonical_prompt,category)
    values(question_a,owner_a,'Synthetic gateway interview question','behavioral');
  insert into public.interview_question_preparations(id,user_id,question_id)
    values(preparation_a,owner_a,question_a);

  req:=jsonb_build_object('clientId','personalos-codex','redirectUri','http://127.0.0.1:54321/callback',
    'scope',jsonb_build_array('notes:read','notes:write','interview:read','interview:append'),
    'resource',resource,'state',repeat('s',32),'codeChallenge',repeat('A',43),'codeChallengeMethod','S256','csrfHash',csrf);
  execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.get_client('missing') is null,'unknown client absent');
  perform pg_temp.gateway_assert(content_gateway.get_client('personalos-codex')->>'ownerId'=owner_a::text,'server client DTO identifies configured owner');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"codeChallengeMethod":"plain"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"redirectUri":"http://localhost:54321/callback"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"redirectUri":"http://127.0.0.1:54321/callback?extra=1"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"redirectUri":"http://127.0.0.1:65536/callback"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"redirectUri":"http://127.0.0.1:54321/callback#fragment"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"redirectUri":"http://127.0.0.1@evil.example:54321/callback"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||'{"resource":"https://other.example.invalid/mcp"}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req||jsonb_build_object('userId',owner_a)),'22023');
  request_dto:=content_gateway.create_request(req); request_id:=(request_dto->>'id')::uuid;
  perform pg_temp.gateway_assert(not request_dto ? 'csrfHash' and request_dto->>'consumedAt' is null,'request DTO excludes CSRF hash and starts pending');
  perform pg_temp.gateway_assert(content_gateway.get_token(token_hash,resource) is null,'no access before consent');
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  perform pg_temp.gateway_expect_error(format('select public.approve_content_authorization(%L,%L,%L,array[''notes:read''])',request_id,csrf,code_hash),'42501');
  perform pg_temp.gateway_expect_error('select * from content_auth.tokens','42501');

  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  perform pg_temp.gateway_expect_error(format('select public.approve_content_authorization(%L,%L,%L,array[''notes:read''])',request_id,csrf,code_hash),'42501');
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  perform pg_temp.gateway_expect_error(format('select public.approve_content_authorization(%L,%L,%L,array[''notes:read''])',request_id,repeat('0',64),code_hash),'22023');
  perform pg_temp.gateway_expect_error(format('select public.approve_content_authorization(%L,%L,%L,array[''admin''])',request_id,csrf,code_hash),'42501');
  code_dto:=public.approve_content_authorization(request_id,csrf,code_hash,array['notes:read','notes:write','interview:read','interview:append']);
  grant_id:=(code_dto->>'grantId')::uuid;
  perform pg_temp.gateway_assert(code_dto->>'ownerId'=owner_a::text and code_dto->>'codeChallengeMethod'='S256','approval binds owner and S256');
  perform pg_temp.gateway_assert(not code_dto ? 'codeHash','approval never exposes stored hash');
  perform pg_temp.gateway_expect_error(format('select public.approve_content_authorization(%L,%L,%L,array[''notes:read''])',request_id,csrf,repeat('f',64)),'22023');

  execute 'reset role'; execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.get_request(request_id)->>'consumedAt' is not null,'approved request cannot be reused');
  perform pg_temp.gateway_assert(content_gateway.get_code(code_hash)->>'grantId'=grant_id::text,'code refers to consented grant');
  perform pg_temp.gateway_assert(content_gateway.consume_code(code_hash,nonce_hash),'first code consumer succeeds');
  perform pg_temp.gateway_assert(not content_gateway.consume_code(code_hash,repeat('e',64)),'second code consumer fails');
  perform pg_temp.gateway_assert(content_gateway.get_code(code_hash) is null,'consumed code no longer available');
  perform pg_temp.gateway_expect_error(format('select content_gateway.save_token(%L,%L,%L,%L)',code_hash,repeat('e',64),token_hash,clock_timestamp()+interval '59 minutes'),'42501');
  perform pg_temp.gateway_expect_error(format('select content_gateway.save_token(%L,%L,%L,%L)',code_hash,nonce_hash,token_hash,clock_timestamp()+interval '61 minutes'),'22023');
  desired_expiry:=clock_timestamp()+interval '1 hour';
  token_dto:=content_gateway.save_token(code_hash,nonce_hash,token_hash,desired_expiry);
  actual_expiry:=(token_dto->>'expiresAt')::timestamptz;
  perform pg_temp.gateway_assert(actual_expiry<desired_expiry,'token is capped at earlier consent expiry');
  perform pg_temp.gateway_assert(token_dto->>'ownerId'=owner_a::text and token_dto->>'grantId'=grant_id::text,'token owner and grant cannot be supplied by runtime');
  perform pg_temp.gateway_expect_error(format('select content_gateway.save_token(%L,%L,%L,%L)',code_hash,nonce_hash,repeat('e',64),clock_timestamp()+interval '59 minutes'),'42501');
  perform pg_temp.gateway_assert(content_gateway.get_token(token_hash,'https://other.example.invalid/mcp') is null,'wrong resource audience rejected');
  perform pg_temp.gateway_assert(content_gateway.get_token(repeat('0',64),resource) is null,'unrecognized token rejected');
  perform pg_temp.gateway_expect_error(format('select content_gateway._token_context(%L,%L)',token_hash,resource),'42501');

  -- Forging PostgREST identity settings must not allow runtime table access.
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  old_claims:=jsonb_build_object('sub',owner_b,'role','authenticated')::text;
  perform set_config('request.jwt.claims',old_claims,true);
  perform pg_temp.gateway_expect_error('select body_markdown from public.notes','42501');
  perform pg_temp.gateway_expect_error('update public.notes set title=''forbidden''','42501');
  command:=jsonb_build_object('operation','note.create','operationId',gen_random_uuid(),'source','codex',
    'title','Synthetic gateway note','bodyMarkdown',E'  Exact synthetic source\n','contentOrigin','human','captureMode','original');
  perform pg_temp.gateway_expect_error(format('select public.write_content(%L::jsonb)',command),'42501');
  result:=content_gateway.write_content(token_hash,resource,command); note_id:=(result->>'entityId')::uuid;
  perform pg_temp.gateway_assert(current_setting('request.jwt.claim.sub',true)=owner_b::text,'content call restores prior sub');
  perform pg_temp.gateway_assert(current_setting('request.jwt.claims',true)=old_claims,'content call restores prior claims');
  replay:=content_gateway.write_content(token_hash,resource,command);
  perform pg_temp.gateway_assert(replay=result||'{"replayed":true}','canonical idempotent receipt preserved');
  read_result:=content_gateway.read_content(token_hash,resource,jsonb_build_object('action','read','kind','note','id',note_id));
  perform pg_temp.gateway_assert(read_result->>'body_markdown'=E'  Exact synthetic source\n','scoped read preserves source bytes');
  perform pg_temp.gateway_assert(content_gateway.read_content(token_hash,resource,jsonb_build_object('action','read','kind','note','id',other_note)) is null,'another owner content absent');
  perform pg_temp.gateway_expect_error(format('select content_gateway.read_content(%L,%L,%L::jsonb)',token_hash,resource,'{"action":"find","kind":"note","q":"Synthetic","limit":31}'),'22023');
  perform pg_temp.gateway_expect_error(format('select content_gateway.write_content(%L,%L,%L::jsonb)',token_hash,resource,command||'{"source":"claude"}'),'22023');

  -- Canonical Interview writer still appends unconfirmed drafts.
  command:=jsonb_build_object('operation','interview.answer.append','operationId',gen_random_uuid(),'source','codex',
    'preparationId',preparation_a,'answerMode','spoken','language','zh','targetSeconds',null,
    'expectedVersion',0,'expectedAnswerId',null,'expectedUpdatedAt',null,'bodyMarkdown','Synthetic draft','changeNote',null);
  result:=content_gateway.write_content(token_hash,resource,command);
  read_result:=content_gateway.read_content(token_hash,resource,jsonb_build_object('action','read','kind','interview','id',preparation_a,'answerId',result->>'answerId'));
  perform pg_temp.gateway_assert(read_result->'selectedAnswer'->>'status'='draft' and read_result->'selectedAnswer'->>'confirmed_at' is null,'Interview write remains an unconfirmed draft');

  execute 'reset role';
  perform pg_temp.gateway_assert((select status<>'ready' from public.interview_question_preparations where id=preparation_a),'first unconfirmed draft never auto-promotes readiness');
  perform pg_temp.gateway_assert((select user_id=owner_a from public.notes where id=note_id),'write owner derived from grant, never forged GUC');
  perform pg_temp.gateway_assert((select count(*)=1 from public.search_documents where entity_type='note' and entity_id=note_id and user_id=owner_a),'search-index trigger succeeds under executor grants');
  perform pg_temp.gateway_assert((select count(*)=1 from public.note_versions where note_id=note_id),'one canonical initial snapshot');
  update public.notes set ai_visibility='never' where id=note_id;
  execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.read_content(token_hash,resource,jsonb_build_object('action','read','kind','note','id',note_id)) is null,'never-visible note excluded');
  execute 'reset role'; update public.notes set ai_visibility='normal' where id=note_id;

  -- A separate owner-consented read-only grant cannot write content.
  execute 'set local role content_gateway_runtime';
  request_dto:=content_gateway.create_request(req||jsonb_build_object('scope',jsonb_build_array('notes:read')));
  request_id:=(request_dto->>'id')::uuid;
  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  code_dto:=public.approve_content_authorization(request_id,csrf,repeat('5',64),array['notes:read']);
  read_grant:=(code_dto->>'grantId')::uuid;
  execute 'reset role'; execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.consume_code(repeat('5',64),repeat('6',64)),'read-only code consumed');
  perform content_gateway.save_token(repeat('5',64),repeat('6',64),readable_token,clock_timestamp()+interval '59 minutes');
  perform pg_temp.gateway_expect_error(format('select content_gateway.write_content(%L,%L,%L::jsonb)',readable_token,resource,command),'P0202');
  perform pg_temp.gateway_assert(content_gateway.read_content(readable_token,resource,jsonb_build_object('action','read','kind','note','id',note_id)) is not null,'read-only grant reads selected permitted note');
  perform pg_temp.gateway_expect_error(format('select content_gateway.read_content(%L,%L,%L::jsonb)',readable_token,resource,jsonb_build_object('action','read','kind','interview','id',preparation_a)),'P0202');

  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform pg_temp.gateway_expect_error(format('select public.revoke_content_authorization(%L)',grant_id),'42501');
  perform pg_temp.gateway_assert(public.list_content_authorizations()='[]'::jsonb,'other owner has no grant metadata');
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform pg_temp.gateway_assert(jsonb_array_length(public.list_content_authorizations())=2,'owner can inspect own grants');
  perform public.revoke_content_authorization(grant_id);
  execute 'reset role'; execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.get_token(token_hash,resource) is null,'owner revocation immediately invalidates subsequent checks');
  perform pg_temp.gateway_expect_error(format('select content_gateway.write_content(%L,%L,%L::jsonb)',token_hash,resource,command),'P0201');
  perform pg_temp.gateway_assert(content_gateway.get_token(readable_token,resource) is not null,'one-grant revocation leaves another grant valid');
  perform content_gateway.revoke_token(readable_token,'wrong-client');
  perform pg_temp.gateway_assert(content_gateway.get_token(readable_token,resource) is not null,'wrong-client revocation does not revoke another client');
  perform content_gateway.revoke_token(readable_token,'personalos-codex');
  perform pg_temp.gateway_assert(content_gateway.get_token(readable_token,resource) is null,'client logout revokes its grant');
  execute 'reset role';

  -- A new request cleans expired unapproved rows only; the consent history stays.
  insert into content_auth.requests(client_id,redirect_uri,scope,resource,state,code_challenge,csrf_hash,expires_at)
    values('personalos-codex','http://127.0.0.1:54321/callback',array['notes:read'],resource,'expired',repeat('A',43),csrf,clock_timestamp()-interval '1 second');
  execute 'set local role content_gateway_runtime';
  request_dto:=content_gateway.create_request(req||'{"state":"x"}');
  execute 'reset role';
  perform pg_temp.gateway_assert(not exists(select 1 from content_auth.requests where state='expired'),'expired pending request removed');
  perform pg_temp.gateway_assert((select count(*)=2 from content_auth.grants),'request cleanup preserves grant history');
  insert into content_auth.requests(client_id,redirect_uri,scope,resource,state,code_challenge,csrf_hash)
    select 'personalos-codex','http://127.0.0.1:54321/callback',array['notes:read'],resource,'bounded-'||n,repeat('A',43),csrf from generate_series(1,99) n;
  execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req),'P0203');
  execute 'reset role';

  -- No raw credentials were stored, and disabling configuration remains fail-closed.
  perform pg_temp.gateway_assert((select count(*)=2 from content_auth.tokens),'one access token per consented grant');
  update content_auth.clients set enabled=false where id='personalos-codex';
  execute 'set local role content_gateway_runtime';
  perform pg_temp.gateway_assert(content_gateway.get_client('personalos-codex') is null,'disabled client unavailable');
  perform pg_temp.gateway_expect_error(format('select content_gateway.create_request(%L::jsonb)',req),'22023');
  execute 'reset role';
end;
$tests$;
rollback;
