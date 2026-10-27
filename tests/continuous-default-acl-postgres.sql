-- Disposable database only. Negative DDL/DML probes must fail before any row
-- mutation; every probe remains inside this rolled-back transaction.
begin;
set local role service_role;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$begin
 begin delete from public.todo_creation_receipts where false;raise exception 'TEST receipt DELETE privilege retained';
 exception when insufficient_privilege then null;end;
 begin truncate public.todo_creation_receipts;raise exception 'TEST receipt TRUNCATE privilege retained';
 exception when insufficient_privilege then null;end;
 begin perform count(*) from public.briefing_judgment_versions;raise exception 'TEST judgment direct service SELECT retained';
 exception when insufficient_privilege then null;end;
 begin truncate public.briefing_judgment_versions;raise exception 'TEST judgment TRUNCATE privilege retained';
 exception when insufficient_privilege then null;end;
 begin perform public.claim_agent_generation(null,null,false);raise exception 'TEST owner RPC service EXECUTE retained';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$begin
 begin truncate public.todo_creation_receipts;raise exception 'TEST receipt owner TRUNCATE privilege retained';
 exception when insufficient_privilege then null;end;
 begin truncate public.briefing_judgment_versions;raise exception 'TEST judgment owner TRUNCATE privilege retained';
 exception when insufficient_privilege then null;end;
 begin perform public.finish_todo_creation_receipt(null,null);raise exception 'TEST service RPC owner EXECUTE retained';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform count(*) from public.todo_creation_receipts;raise exception 'TEST receipt anon SELECT retained';
 exception when insufficient_privilege then null;end;
 begin perform public.capture_inbox_intent(null,'Synthetic denied request');raise exception 'TEST capture anon EXECUTE retained';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
