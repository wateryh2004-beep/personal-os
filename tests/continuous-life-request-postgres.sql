-- Disposable PG17 only. The committed synthetic seed permits a real READ ONLY
-- transaction to prove that reconciliation has no write/repair/claim side effect.
begin;
insert into auth.users(id) values('b7100000-0000-4000-8000-000000000001'),('b7100000-0000-4000-8000-000000000002');
insert into public.purchase_items(id,user_id,title,status) values('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','Synthetic request lookup','ready'),('b7200000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001','Synthetic unknown lookup','ready');
insert into public.trips(id,user_id,title) values('b7300000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','Synthetic read-only trip');
insert into public.documents(id,user_id,title,original_filename,storage_bucket,storage_path,mime_type,file_size,storage_provider,storage_state) values
('b7400000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','Ordinary ticket','ticket.pdf','synthetic','b7100000-0000-4000-8000-000000000001/ticket.pdf','application/pdf',123,'cloudflare_r2','available'),
('b7400000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001','Later private ticket','private.pdf','synthetic','b7100000-0000-4000-8000-000000000001/private.pdf','application/pdf',123,'cloudflare_r2','available');
set local role authenticated;
set local request.jwt.claim.sub='b7100000-0000-4000-8000-000000000001';
select public.apply_life_field_operation('b7500000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]');
select public.apply_life_field_operation('b7500000-0000-4000-8000-000000000002','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000002","expected_revision":1,"quantity":"1","quantity_unit":"box"}]');
select public.apply_life_field_operation('b7500000-0000-4000-8000-000000000003','travel_document','[{"id":"b7300000-0000-4000-8000-000000000001","expected_revision":1,"document_id":"b7400000-0000-4000-8000-000000000001","linked":true}]');
select public.apply_life_field_operation('b7500000-0000-4000-8000-000000000004','travel_document','[{"id":"b7300000-0000-4000-8000-000000000001","expected_revision":2,"document_id":"b7400000-0000-4000-8000-000000000002","linked":true}]');
-- A later canonical version must be returned instead of replaying the old after snapshot.
update public.purchase_items set quantity='3.125' where id='b7200000-0000-4000-8000-000000000001';
do $$declare r jsonb;begin r:=public.apply_life_field_operation('b7500000-0000-4000-8000-000000000005','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":3,"quantity":"4","quantity_unit":"kg"}]');perform public.undo_workbench_operation((r->>'receiptId')::uuid);end $$;
reset role;
update public.workspace_action_receipts set status='unknown' where user_id='b7100000-0000-4000-8000-000000000001' and request_id='b7500000-0000-4000-8000-000000000002';
update public.documents set vault_group_id='b7600000-0000-4000-8000-000000000001' where id='b7400000-0000-4000-8000-000000000002';
commit;

begin read only;
set local role authenticated;
set local request.jwt.claim.sub='b7100000-0000-4000-8000-000000000001';
do $$declare result jsonb; original jsonb:='[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]'; receipts bigint; audits bigint;
begin
 select count(*) into receipts from public.workspace_action_receipts;select count(*) into audits from public.audit_logs;
 result:=public.read_life_request_outcome('b7500000-0000-4000-8000-000000000001','shopping_quantity',original);
 assert result->>'status'='saved' and result->>'receiptStatus'='available';assert result#>>'{rows,0,quantity}'='3.125';assert (result#>>'{rows,0,mutation_revision}')::bigint>2;
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000005','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":3,"quantity":"4","quantity_unit":"kg"}]')->>'receiptStatus'='undone';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000001','shopping_quantity',jsonb_set(original,'{0,quantity}','"99"'))->>'code'='conflict';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000009','shopping_quantity',original)->>'status'='missing';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000002','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000002","expected_revision":1,"quantity":"1","quantity_unit":"box"}]')->>'status'='needs-check';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000003','travel_document','[{"id":"b7300000-0000-4000-8000-000000000001","expected_revision":1,"document_id":"b7400000-0000-4000-8000-000000000001","linked":true}]')->>'status'='saved';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000004','travel_document','[{"id":"b7300000-0000-4000-8000-000000000001","expected_revision":2,"document_id":"b7400000-0000-4000-8000-000000000002","linked":true}]')->>'status'='missing';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000009','arbitrary','[]')->>'code'='invalid';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000009','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2","quantity_unit":null}]')->>'code'='invalid';
 assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000009','shopping_purchased','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":1,"extra":"forged"}]')->>'code'='invalid';
 assert (select count(*)=receipts from public.workspace_action_receipts);assert (select count(*)=audits from public.audit_logs);
end $$;
set local request.jwt.claim.sub='b7100000-0000-4000-8000-000000000002';
do $$begin assert public.read_life_request_outcome('b7500000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"b7200000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]')->>'status'='missing';end $$;
reset role;
set local role anon;
do $$begin
 assert not has_function_privilege('anon','public.read_life_request_outcome(uuid,text,jsonb)','execute');
 begin perform public.read_life_request_outcome(gen_random_uuid(),'shopping_purchased','[]');raise exception 'TEST anonymous reader executed';exception when insufficient_privilege then null;end;
end $$;
commit;
