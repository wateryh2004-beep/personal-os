-- Disposable synthetic database only. Run after investment base + daily migrations.
\set ON_ERROR_STOP on
begin;
do $$ begin
  assert not has_function_privilege('anon','public.append_investment_cash(uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.append_investment_quotes(uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.validate_investment_daily_insert()','EXECUTE');
  assert not has_function_privilege('authenticated','public.audit_investment_daily_insert()','EXECUTE');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
insert into investment_accounts(id,user_id,name,mode,currency) values
('aaaaaaaa-1111-4111-8111-111111111111',auth.uid(),'Daily real fixture','real','CNY'),
('aaaaaaaa-2222-4222-8222-222222222222',auth.uid(),'Daily paper fixture','paper','USD');
select append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{"kind":"opening","void_entry_id":null,"symbol":null,"occurred_on":"2026-01-01","amount":"1000","tax":"0","fees":"0","source":"Synthetic opening","import_key":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{"kind":"dividend","void_entry_id":null,"symbol":"TEST:DAILY","occurred_on":"2026-01-02","amount":"10","tax":"2","fees":"1","source":"Synthetic dividend","import_key":"22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
select append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[{"symbol":"TEST:DAILY","currency":"CNY","price":"0","as_of":"2026-01-02T10:00:00Z","source_kind":"manual","source":"Synthetic explicit zero","import_key":"33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
do $$ declare result jsonb; rev integer; cash_id uuid; before_count integer; begin
  select revision into rev from investment_accounts where id='aaaaaaaa-1111-4111-8111-111111111111';
  assert rev=3,'cash and quote writes must share the trade-account serialization lock';
  result:=append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{"kind":"opening","void_entry_id":null,"symbol":null,"occurred_on":"2026-01-01","amount":"1000","tax":"0","fees":"0","source":"Synthetic opening","import_key":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
  assert result->>'duplicate'='true';
  result:=append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[{"symbol":"TEST:DAILY","currency":"CNY","price":"0","as_of":"2026-01-02T10:00:00Z","source_kind":"manual","source":"Synthetic explicit zero","import_key":"33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
  assert result->>'duplicate'='true';
  assert (select revision from investment_accounts where id='aaaaaaaa-1111-4111-8111-111111111111')=rev,'duplicates must not change revisions';
  begin perform append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{"kind":"opening","void_entry_id":null,"symbol":null,"occurred_on":"2026-01-01","amount":"999","tax":"0","fees":"0","source":"Changed","import_key":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'); raise exception 'changed retry accepted'; exception when unique_violation then null; end;
  begin perform append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[{"symbol":"TEST:DAILY","currency":"CNY","price":"1","as_of":"2026-01-02T10:00:00Z","source_kind":"manual","source":"Synthetic explicit zero","import_key":"33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]'); raise exception 'changed quote retry accepted'; exception when unique_violation then null; end;
  -- A batch must roll back the first insert, audit and revision if any later row is invalid.
  select count(*) into before_count from investment_quotes;
  begin perform append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[{"symbol":"TEST:DAILY","currency":"CNY","price":"3","as_of":"2026-01-03T10:00:00Z","source_kind":"imported","source":"Synthetic batch","import_key":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},{"symbol":"TEST:DAILY","currency":"USD","price":"4","as_of":"2026-01-03T10:00:00Z","source_kind":"imported","source":"Wrong currency","import_key":"55555555-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]'); raise exception 'mixed currency batch accepted'; exception when check_violation then null; end;
  assert (select count(*) from investment_quotes)=before_count,'partial quote batch leaked';
  assert (select revision from investment_accounts where id='aaaaaaaa-1111-4111-8111-111111111111')=rev,'failed batch revision changed';
  begin perform append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[{"symbol":"TEST:DAILY","currency":"CNY","price":"1","as_of":"2099-01-01T00:00:00Z","source_kind":"manual","source":"Future","import_key":"66666666-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]'); raise exception 'future quote accepted'; exception when check_violation then null; end;
  begin insert into investment_cash_ledger(user_id,account_id,sequence,kind,occurred_on,amount,tax,fees,source,import_key) values(auth.uid(),'aaaaaaaa-1111-4111-8111-111111111111',0,'opening','2026-01-01','0','0','0','Duplicate opening','77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'duplicate opening accepted'; exception when check_violation then null; end;
  begin insert into investment_cash_ledger(user_id,account_id,sequence,kind,symbol,occurred_on,amount,tax,fees,source,import_key) values(auth.uid(),'aaaaaaaa-1111-4111-8111-111111111111',0,'dividend','TEST:DAILY','2026-01-01','10','9','2','Bad net dividend','77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'negative dividend accepted'; exception when check_violation then null; end;
  begin insert into investment_cash_ledger(user_id,account_id,sequence,kind,occurred_on,amount,tax,fees,source,import_key) values(auth.uid(),'aaaaaaaa-1111-4111-8111-111111111111',0,'deposit','2025-12-31','10','0','0','Before opening','77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'cash before opening accepted'; exception when check_violation then null; end;
  select id into cash_id from investment_cash_ledger where import_key='22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  result:=append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111',jsonb_build_object('kind','void','void_entry_id',cash_id,'symbol',null,'occurred_on',null,'amount','0','tax','0','fees','0','source','Synthetic correction','import_key','88888888-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  assert result->>'duplicate'='false';
  result:=append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111',jsonb_build_object('kind','void','void_entry_id',cash_id,'symbol',null,'occurred_on',null,'amount','0','tax','0','fees','0','source','Synthetic correction','import_key','88888888-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  assert result->>'duplicate'='true';
  assert (select count(*) from investment_cash_ledger where id=cash_id)=1,'void deleted original';
  begin perform append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111',jsonb_build_object('kind','void','void_entry_id',cash_id,'symbol',null,'occurred_on',null,'amount','0','tax','0','fees','0','source','Duplicate correction','import_key','99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa')); raise exception 'double void accepted'; exception when check_violation then null; end;
  begin perform append_investment_cash('aaaaaaaa-2222-4222-8222-222222222222',jsonb_build_object('kind','void','void_entry_id',cash_id,'symbol',null,'occurred_on',null,'amount','0','tax','0','fees','0','source','Cross-account void','import_key','99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa')); raise exception 'cross-account correction accepted'; exception when check_violation then null; end;
  begin update investment_cash_ledger set amount='99'; raise exception 'immutable cash updated'; exception when insufficient_privilege then null; end;
  begin delete from investment_quotes; raise exception 'immutable quote deleted'; exception when insufficient_privilege then null; end;
  assert (select count(*) from audit_logs where entity_type in ('investment_cash_ledger','investment_quotes'))=(select count(*) from investment_cash_ledger)+(select count(*) from investment_quotes),'atomic audits mismatch';
end $$;
-- New account data stays distinct, including identical symbols and original currencies.
select append_investment_quotes('aaaaaaaa-2222-4222-8222-222222222222','[{"symbol":"TEST:DAILY","currency":"USD","price":"500","as_of":"2026-01-02T10:00:00Z","source_kind":"imported","source":"Synthetic paper","import_key":"aaaaaaaa-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
  assert (select count(*) from investment_cash_ledger)=0,'cross-owner cash leak';
  assert (select count(*) from investment_quotes)=0,'cross-owner quote leak';
  begin perform append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{}'); raise exception 'cross-owner cash RPC accepted'; exception when insufficient_privilege then null; end;
  begin perform append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[]'); raise exception 'cross-owner quote RPC accepted'; exception when insufficient_privilege then null; end;
  begin insert into investment_quotes(user_id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111',0,'TEST:DAILY','CNY','1','2026-01-01','manual','Wrong owner',gen_random_uuid()); raise exception 'owner spoof accepted'; exception when insufficient_privilege then null; end;
  begin insert into investment_quotes(user_id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key) values(auth.uid(),'aaaaaaaa-1111-4111-8111-111111111111',0,'TEST:DAILY','CNY','1','2026-01-01','manual','Foreign account',gen_random_uuid()); raise exception 'foreign account accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform * from investment_cash_ledger; raise exception 'anonymous cash read'; exception when insufficient_privilege then null; end;
  begin perform * from investment_quotes; raise exception 'anonymous quote read'; exception when insufficient_privilege then null; end;
  begin perform append_investment_cash('aaaaaaaa-1111-4111-8111-111111111111','{}'); raise exception 'anonymous cash write'; exception when insufficient_privilege then null; end;
  begin perform append_investment_quotes('aaaaaaaa-1111-4111-8111-111111111111','[]'); raise exception 'anonymous quote write'; exception when insufficient_privilege then null; end;
end $$;
rollback;
