\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'assertion failed: %',label; end if; end; $$;
select pg_temp.assert_true(current_database() = 'pdf_cover_test', 'isolated test database');
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.documents (id,user_id,storage_path,storage_bucket,file_size,checksum) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111/files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sealed-a/fixture.pdf','private-test',100,repeat('a',64)),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/files/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/sealed-b/fixture.pdf','private-test',100,null);

select pg_temp.assert_true(not has_table_privilege('anon','public.pdf_cover_jobs','select'), 'anonymous cannot read jobs');
select pg_temp.assert_true(has_table_privilege('authenticated','public.pdf_cover_jobs','select'), 'owners can read jobs under RLS');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pdf_cover_jobs','insert,update,delete'), 'browser cannot forge derivative metadata');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.claim_pdf_cover(uuid,text,uuid)','execute'), 'browser cannot claim');
select pg_temp.assert_true(not has_function_privilege('anon','public.enqueue_pdf_cover(uuid,uuid,text,text,integer)','execute'), 'anonymous cannot enqueue');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.finish_pdf_cover(uuid,uuid,uuid,boolean,text,text,integer,integer,integer,text,boolean)','execute'), 'browser cannot finish');
select pg_temp.assert_true(not exists(select 1 from pg_proc where proname in ('enqueue_pdf_cover','claim_pdf_cover','finish_pdf_cover','backfill_pdf_covers','invalidate_pdf_cover_artifact') and prosecdef), 'no definer privilege escalation');
set local role service_role;
select pg_temp.assert_true((select count(*)=0 from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1','private-test',10)), 'mismatched owner cannot enqueue');
select pg_temp.assert_true((select count(*)=0 from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v1','other-bucket',10)), 'wrong bucket cannot enqueue');
select pg_temp.assert_true(public.backfill_pdf_covers('11111111-1111-4111-8111-111111111111','fixture-v1','private-test',1)=1, 'bounded old-file enqueue');
select pg_temp.assert_true(public.backfill_pdf_covers('11111111-1111-4111-8111-111111111111','fixture-v1','private-test',1)=0, 'backfill does not reset existing work');
select * from public.enqueue_pdf_cover('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1','private-test',0);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true((select count(*)=1 from public.pdf_cover_jobs), 'RLS limits owner row');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.assert_true((select count(*)=0 from public.pdf_cover_jobs), 'unrelated owner sees nothing');
reset role;

set local role service_role;
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1');
select pg_temp.assert_true((select attempts=1 and status='processing' from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'first lease claimed');
select pg_temp.assert_true((select count(*)=0 from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1')), 'duplicate live lease refused');
select pg_temp.assert_true(not public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000000',true,repeat('a',64),repeat('b',64),50,20,30), 'wrong token cannot publish');
select pg_temp.assert_true(public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select lease_token from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),false,p_error_code=>'pdf_cover_unavailable',p_retryable=>true), 'failure recorded');
select pg_temp.assert_true((select status='failed' and next_attempt_at=now()+interval '30 seconds' from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'first retry backoff is durable');
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v1','private-test',10);
select pg_temp.assert_true((select attempts=1 and status='failed' from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'polling never resets attempts');
select pg_temp.assert_true((select count(*)=0 from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1')), 'retry cannot run early');
update public.pdf_cover_jobs set next_attempt_at=now()-interval '1 second' where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1');
select pg_temp.assert_true((select attempts=2 from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'second attempt counted');
select set_config('test.old_token',(select lease_token::text from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true);
update public.pdf_cover_jobs set lease_expires_at=now()-interval '1 second' where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1');
select pg_temp.assert_true((select attempts=3 and lease_token<>current_setting('test.old_token')::uuid from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'expired lease reclaimed with new token');
select pg_temp.assert_true(not public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('test.old_token')::uuid,true,repeat('a',64),repeat('b',64),50,20,30), 'expired worker cannot publish');
update public.pdf_cover_jobs set lease_expires_at=now()-interval '1 second' where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert_true((select count(*)=0 from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v1')), 'three lost workers exhaust attempts');
select pg_temp.assert_true((select status='failed' and next_attempt_at is null and error_code='pdf_cover_attempts_exhausted' from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'exhausted work is terminal');

-- A derivative read repair is a compare-and-set with the original retry budget.
select pg_temp.assert_true(not has_function_privilege('authenticated','public.invalidate_pdf_cover_artifact(uuid,uuid,text,text,text,boolean)','execute'), 'browser cannot invalidate artifacts');
select * from public.claim_pdf_cover('22222222-2222-4222-8222-222222222222','fixture-v1');
select pg_temp.assert_true(public.finish_pdf_cover('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',(select lease_token from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),true,repeat('a',64),repeat('b',64),50,20,30), 'legacy checksum-free cover can publish its observed digest');
select pg_temp.assert_true(not public.invalidate_pdf_cover_artifact('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1',repeat('a',64),repeat('b',64),true), 'wrong owner cannot invalidate');
select pg_temp.assert_true(not public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1',repeat('a',64),repeat('c',64),true), 'wrong digest cannot invalidate');
select pg_temp.assert_true(not public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other-version',repeat('a',64),repeat('b',64),true), 'wrong version cannot invalidate');
select pg_temp.assert_true(public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1',repeat('a',64),repeat('b',64),true), 'confirmed missing artifact can requeue');
select pg_temp.assert_true((select status='pending' and attempts=1 and next_attempt_at<=now() and storage_path is null from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'missing repair preserves attempts');
select pg_temp.assert_true(not public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1',repeat('a',64),repeat('b',64),true), 'repeated stale repair does not reset pending work');
select * from public.claim_pdf_cover('22222222-2222-4222-8222-222222222222','fixture-v1');
select public.finish_pdf_cover('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',(select lease_token from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),true,repeat('a',64),repeat('b',64),50,20,30);
select pg_temp.assert_true(public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v1',repeat('a',64),repeat('b',64),false), 'corrupt immutable artifact invalidated');
select pg_temp.assert_true((select status='failed' and attempts=2 and next_attempt_at is null from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'corruption is terminal without overwrite');
select * from public.enqueue_pdf_cover('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v3','private-test',0);
select * from public.claim_pdf_cover('22222222-2222-4222-8222-222222222222','fixture-v3');
update public.pdf_cover_jobs set attempts=3 where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.finish_pdf_cover('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',(select lease_token from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),true,repeat('a',64),repeat('b',64),50,20,30);
select pg_temp.assert_true(public.invalidate_pdf_cover_artifact('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-v3',repeat('a',64),repeat('b',64),true), 'exhausted artifact invalidated');
select pg_temp.assert_true((select status='failed' and attempts=3 and next_attempt_at is null from public.pdf_cover_jobs where document_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'exhausted repairs remain terminal');

-- New renderer/source resets failure, while rename alone must reuse the artifact.
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10);
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v2');
select pg_temp.assert_true(public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select lease_token from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true,repeat('a',64),repeat('b',64),50,20,30), 'success published');
update public.documents set title='Renamed only' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10);
select pg_temp.assert_true((select status='ready' and attempts=1 from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'rename retains ready cover');
update public.documents set archived_at=now(),storage_state='archived' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert_true((select count(*)=0 from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10)), 'archive cannot enqueue');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true((select count(*)=0 from public.pdf_cover_jobs), 'archived cover hidden by RLS');
reset role;
set local role service_role;
update public.documents set archived_at=null,storage_state='available',checksum=repeat('c',64) where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10);
select pg_temp.assert_true((select status='pending' and attempts=0 and storage_path is null from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'checksum change invalidates cover');
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v2');
select set_config('test.changed_token',(select lease_token::text from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true);
update public.documents set storage_path=storage_path || '.new' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert_true(not public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('test.changed_token')::uuid,true,repeat('c',64),repeat('b',64),50,20,30), 'source changed during work cannot publish');
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10);
select pg_temp.assert_true((select lease_token=current_setting('test.changed_token')::uuid from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'source invalidation retains live lease to bound concurrency');
update public.pdf_cover_jobs set lease_expires_at=now()-interval '1 second' where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select * from public.enqueue_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-v2','private-test',10);
select pg_temp.assert_true((select attempts=0 and status='pending' and source_path like '%.new' from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'new source starts after old lease expires');
select * from public.claim_pdf_cover('11111111-1111-4111-8111-111111111111','fixture-v2');
update public.documents set archived_at=now(),storage_state='archived' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert_true(not public.finish_pdf_cover('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select lease_token from public.pdf_cover_jobs where document_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true,repeat('c',64),repeat('b',64),50,20,30), 'archive during render prevents publish');
reset role;
rollback;
\echo 'PDF cover SQL ownership, RLS, retry, lease and invalidation regressions passed'
