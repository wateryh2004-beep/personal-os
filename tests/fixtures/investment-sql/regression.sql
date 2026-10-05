-- Synthetic-only contract regression. Run bootstrap + candidate first in disposable Postgres.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
insert into investment_accounts(id,user_id,name,mode,currency) values('11111111-1111-4111-8111-111111111111',auth.uid(),'CI synthetic real','real','CNY');
insert into investment_accounts(id,user_id,name,mode,currency) values('99999999-9999-4999-8999-999999999999',auth.uid(),'CI concurrency fixture','paper','USD');
select append_investment_strategy('{"strategy_key":"ci-strategy","title":"Version one","body_markdown":"Synthetic research only"}');
select append_investment_strategy('{"strategy_key":"ci-strategy","title":"Version two","body_markdown":"Changed synthetic hypothesis"}');
select append_investment_entry('11111111-1111-4111-8111-111111111111',0,'{"kind":"buy","symbol":"TEST:ASSET","occurred_on":"2026-01-01","quantity":"10","price":"10","fees":"1","source":"CI synthetic record","import_key":"22222222-2222-4222-8222-222222222222"}',repeat('a',64));
do $$ declare result jsonb; begin
  result:=append_investment_entry('11111111-1111-4111-8111-111111111111',0,'{"kind":"buy","symbol":"TEST:ASSET","occurred_on":"2026-01-01","quantity":"10","price":"10","fees":"1","source":"CI synthetic record","import_key":"22222222-2222-4222-8222-222222222222"}',repeat('a',64));
  assert result->>'duplicate'='true','exact retry must deduplicate';
  assert (select count(*) from investment_ledger)=1,'retry must not insert';
  begin
    perform append_investment_entry('11111111-1111-4111-8111-111111111111',1,'{"kind":"buy","symbol":"TEST:ASSET","occurred_on":"2026-01-01","quantity":"999","price":"10","fees":"1","source":"CI synthetic record","import_key":"22222222-2222-4222-8222-222222222222"}',repeat('a',64));
    raise exception 'changed content with saved hash was accepted';
  exception when unique_violation then null; end;
  assert (select count(*) from investment_strategy_versions)=2,'old strategy versions must survive';
end $$;
select append_investment_entry('11111111-1111-4111-8111-111111111111',1,'{"kind":"sell","symbol":"TEST:ASSET","occurred_on":"2026-01-02","quantity":"4","price":"20","fees":"1","source":"CI synthetic sale","import_key":"33333333-3333-4333-8333-333333333333"}',repeat('b',64));
do $$ declare target_id uuid; before_revision integer; begin
  select id into target_id from investment_ledger where kind='buy';
  select revision into before_revision from investment_accounts where id='11111111-1111-4111-8111-111111111111';
  begin
    perform append_investment_entry('11111111-1111-4111-8111-111111111111',2,jsonb_build_object('kind','void','void_entry_id',target_id,'symbol','TEST:ASSET','occurred_on','2026-01-01','quantity','10','price',null,'fees','0','source','Invalid: would orphan sale','import_key','44444444-4444-4444-8444-444444444444'),repeat('c',64));
    raise exception 'unsafe void accepted';
  exception when check_violation then null; end;
  assert (select revision from investment_accounts where id='11111111-1111-4111-8111-111111111111')=before_revision,'failed void must roll back revision';
  select id into target_id from investment_ledger where kind='sell';
  perform append_investment_entry('11111111-1111-4111-8111-111111111111',2,jsonb_build_object('kind','void','void_entry_id',target_id,'symbol','TEST:ASSET','occurred_on','2026-01-02','quantity','4','price',null,'fees','0','source','Synthetic mistaken sale','import_key','55555555-5555-4555-8555-555555555555'),repeat('d',64));
  assert (select count(*) from investment_ledger where kind='sell')=1,'void must preserve original';
  assert (select sum(case when e.kind='sell' then -e.quantity::numeric else e.quantity::numeric end) from investment_ledger e where e.kind<>'void' and not exists(select 1 from investment_ledger v where v.void_entry_id=e.id))=10,'safe void must restore remaining quantity';
  begin
    insert into investment_ledger(user_id,account_id,sequence,kind,symbol,occurred_on,quantity,price,fees,source,import_key,payload_hash) values(auth.uid(),'11111111-1111-4111-8111-111111111111',4,'sell','TEST:ASSET','2025-12-31','1','1','0','Invalid backdated sale','66666666-6666-4666-8666-666666666666',repeat('e',64));
    raise exception 'direct backdated oversell accepted';
  exception when check_violation then null; end;
end $$;
-- Direct valid insert must trigger the same audit as RPC writes.
insert into investment_ledger(user_id,account_id,sequence,kind,symbol,occurred_on,quantity,price,fees,source,import_key,payload_hash) values(auth.uid(),'11111111-1111-4111-8111-111111111111',4,'opening','TEST:UNKNOWN','2026-01-01','2',null,'0','Unknown cost fixture','77777777-7777-4777-8777-777777777777',repeat('f',64));
select append_investment_research('{"import_key":"ci-research","title":"Synthetic opinion","kind":"research","body_markdown":"Test only","as_of":"2026-01-01","source_urls":["https://example.com/fixture"],"strategy_version_id":null,"provenance":{"producer":"CI","limitations":"Synthetic"},"metrics":null}',repeat('a',64));
do $$ begin
  assert (select count(*) from audit_logs)=(select count(*) from investment_accounts)+(select count(*) from investment_ledger)+(select count(*) from investment_strategy_versions)+(select count(*) from investment_research_runs),'all inserts including direct writes must be audited once';
  begin
    perform append_investment_research('{"import_key":"ci-research","title":"Changed title","kind":"research","body_markdown":"Test only","as_of":"2026-01-01","source_urls":["https://example.com/fixture"],"strategy_version_id":null,"provenance":{"producer":"CI","limitations":"Synthetic"},"metrics":null}',repeat('a',64));
    raise exception 'changed research with saved hash accepted';
  exception when unique_violation then null; end;
  begin
    insert into investment_research_runs(user_id,import_key,payload_hash,title,kind,body_markdown,as_of,source_urls,provenance,metrics) values(auth.uid(),'invalid-json',repeat('b',64),'Invalid','backtest','Test','2026-01-01','[{}]','{"producer":{},"limitations":"test","dataset_snapshot":null,"code_version":null,"period_start":null,"period_end":null,"benchmark":null,"costs":null,"artifact_url":null}','{}');
    raise exception 'malformed direct JSON accepted';
  exception when check_violation then null; end;
  begin update investment_ledger set source='overwrite'; raise exception 'immutable ledger updated'; exception when insufficient_privilege then null; end;
  begin delete from investment_strategy_versions; raise exception 'old versions deleted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('ci.strategy_id',(select id::text from investment_strategy_versions where version=1),true);
-- Owner B must not see owner A, reuse A's account, or assign a record to A.
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
  assert (select count(*) from investment_accounts)=0,'cross-owner account leak';
  assert (select count(*) from investment_ledger)=0,'cross-owner ledger leak';
  assert (select count(*) from investment_strategy_versions)=0,'cross-owner strategy leak';
  assert (select count(*) from investment_research_runs)=0,'cross-owner research leak';
  assert (select count(*) from audit_logs)=0,'cross-owner audit leak';
  begin insert into investment_accounts(user_id,name,mode,currency) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','wrong owner','real','CNY'); raise exception 'owner reassignment accepted'; exception when insufficient_privilege then null; end;
  begin perform append_investment_entry('11111111-1111-4111-8111-111111111111',4,'{}',repeat('c',64)); raise exception 'cross-owner append accepted'; exception when insufficient_privilege then null; end;
  begin
    perform append_investment_research(jsonb_build_object('import_key','cross-owner-strategy','title','Invalid cross-reference','kind','research','body_markdown','Test','as_of','2026-01-01','source_urls',jsonb_build_array('https://example.com/fixture'),'strategy_version_id',current_setting('ci.strategy_id'),'provenance',jsonb_build_object('producer','CI','limitations','Test'),'metrics',null),repeat('d',64));
    raise exception 'cross-owner strategy link accepted';
  exception when foreign_key_violation then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform * from investment_accounts; raise exception 'anonymous read allowed'; exception when insufficient_privilege then null; end;
  begin perform append_investment_strategy('{"strategy_key":"bad","title":"bad","body_markdown":"bad"}'); raise exception 'anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
commit;
