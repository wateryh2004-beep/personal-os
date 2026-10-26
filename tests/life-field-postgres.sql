-- Synthetic-only regression against the complete, actually migrated schema.
-- No fabricated table shape, no stub constraints, no production connections.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('71000000-0000-4000-8000-000000000001'),('71000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
insert into public.purchase_items(id,user_id,title,status,price_cny) values
('72000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic quantity unknown','ready',12),
('72000000-0000-4000-8000-000000000002',auth.uid(),'Synthetic second','ready',15),
('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002','Other owner','ready',1);
insert into public.trips(id,user_id,title) values ('73000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic trip');
insert into public.trip_stops(id,user_id,trip_id,place_name,day_number) values
('74000000-0000-4000-8000-000000000001',auth.uid(),'73000000-0000-4000-8000-000000000001','First',1),
('74000000-0000-4000-8000-000000000002',auth.uid(),'73000000-0000-4000-8000-000000000001','Second',1);
insert into public.documents(id,user_id,title,original_filename,storage_bucket,storage_path,mime_type,file_size,storage_provider,storage_state) values
('75000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic ticket','ticket.pdf','synthetic','71000000-0000-4000-8000-000000000001/ticket.pdf','application/pdf',123,'cloudflare_r2','available'),
('75000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','Other ticket','other.pdf','synthetic','71000000-0000-4000-8000-000000000002/other.pdf','application/pdf',123,'cloudflare_r2','available');
set local role authenticated;
do $$ declare r jsonb; replay jsonb; begin
 assert (select quantity is null and quantity_unit is null from public.purchase_items where id='72000000-0000-4000-8000-000000000001'),'legacy unknown cannot be invented';
 r:=public.apply_life_field_operation('77000000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]');
 assert r#>>'{rows,0,quantity}'='2.125';
 perform set_config('life.test.quantity_receipt',r->>'receiptId',true);
 replay:=public.apply_life_field_operation('77000000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]');
 assert replay->>'duplicate'='true';
 begin
  perform public.apply_life_field_operation('77000000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":2,"quantity":"3","quantity_unit":"kg"}]');
  raise exception 'changed request accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.apply_life_field_operation(gen_random_uuid(),'shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":2,"quantity":"9","quantity_unit":"kg"},{"id":"72000000-0000-4000-8000-000000000002","expected_revision":999,"quantity":"1","quantity_unit":"bag"}]');
  raise exception 'stale batch accepted';
 exception when serialization_failure then null; end;
 assert (select quantity='2.125' and mutation_revision=2 from public.purchase_items where id='72000000-0000-4000-8000-000000000001'),'whole batch must roll back';
 begin
  perform public.apply_life_field_operation(gen_random_uuid(),'shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000003","expected_revision":1,"quantity":"1","quantity_unit":"bag"}]');
  raise exception 'foreign owner accepted';
 exception when insufficient_privilege then null; end;
 perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 assert (select quantity is null and mutation_revision=3 from public.purchase_items where id='72000000-0000-4000-8000-000000000001');
 replay:=public.apply_life_field_operation('77000000-0000-4000-8000-000000000001','shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":1,"quantity":"2.125","quantity_unit":"kg"}]');
 assert replay#>'{rows,0,quantity}'='null'::jsonb and replay#>>'{rows,0,mutation_revision}'='3','retry after undo reads current state';
 assert public.undo_workbench_operation((r->>'receiptId')::uuid)->>'duplicate'='true';
 r:=public.apply_life_field_operation(gen_random_uuid(),'shopping_quantity','[{"id":"72000000-0000-4000-8000-000000000001","expected_revision":3,"quantity":"1","quantity_unit":"bag"}]');
 -- ABA through the legacy raw update route must invalidate the receipt.
 update public.purchase_items set quantity='2' where id='72000000-0000-4000-8000-000000000001';
 update public.purchase_items set quantity='1' where id='72000000-0000-4000-8000-000000000001';
 begin perform public.undo_workbench_operation((r->>'receiptId')::uuid);raise exception 'ABA undo accepted';exception when serialization_failure then null;end;
end $$;
-- Full real schema includes document owner constraints and vault columns.
do $$ declare r jsonb; rev bigint; begin
 select mutation_revision into rev from public.trips where id='73000000-0000-4000-8000-000000000001';
 begin
  perform public.apply_life_field_operation(gen_random_uuid(),'travel_document',jsonb_build_array(jsonb_build_object('id','73000000-0000-4000-8000-000000000001','expected_revision',rev,'document_id','75000000-0000-4000-8000-000000000002','linked',true)));
  raise exception 'foreign ticket accepted';
 exception when others then if sqlerrm not like '%life_document_unavailable%' then raise;end if;end;
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_document',jsonb_build_array(jsonb_build_object('id','73000000-0000-4000-8000-000000000001','expected_revision',rev,'document_id','75000000-0000-4000-8000-000000000001','linked',true)));
 assert (select count(*)=1 from public.trip_documents where trip_id='73000000-0000-4000-8000-000000000001' and archived_at is null);
 perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 assert (select count(*)=0 from public.trip_documents where trip_id='73000000-0000-4000-8000-000000000001' and archived_at is null);
 select mutation_revision into rev from public.trips where id='73000000-0000-4000-8000-000000000001';
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_next_stop',jsonb_build_array(jsonb_build_object('id','73000000-0000-4000-8000-000000000001','expected_revision',rev,'current_stop_id','74000000-0000-4000-8000-000000000001','next_stop_id','74000000-0000-4000-8000-000000000002')));
 perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_stop_metadata','[{"id":"74000000-0000-4000-8000-000000000001","expected_revision":1,"day_number":2,"planned_time":"13:45","duration_minutes":30},{"id":"74000000-0000-4000-8000-000000000002","expected_revision":1,"day_number":1,"planned_time":"09:00","duration_minutes":null}]');
 assert r#>>'{rows,0,day_number}'='2';perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_stop_order','[{"id":"74000000-0000-4000-8000-000000000001","expected_revision":3,"sort_order":1},{"id":"74000000-0000-4000-8000-000000000002","expected_revision":3,"sort_order":0}]');
 perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 -- Updating another station advances the parent, invalidating an earlier layout receipt.
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_stop_order','[{"id":"74000000-0000-4000-8000-000000000001","expected_revision":5,"sort_order":1},{"id":"74000000-0000-4000-8000-000000000002","expected_revision":5,"sort_order":0}]');
 insert into public.trip_stops(id,user_id,trip_id,place_name,sort_order) values('74000000-0000-4000-8000-000000000003',auth.uid(),'73000000-0000-4000-8000-000000000001','Concurrent/legacy next insert',0);
 assert (select sort_order=2 from public.trip_stops where id='74000000-0000-4000-8000-000000000003'),'parent lock/MAX prevents COUNT duplicate';
 begin perform public.undo_workbench_operation((r->>'receiptId')::uuid);raise exception 'stale parent layout undo accepted';exception when serialization_failure then null;end;
 r:=public.apply_life_field_operation(gen_random_uuid(),'travel_stop_arrival','[{"id":"74000000-0000-4000-8000-000000000001","expected_revision":6,"arrived":true}]');
 assert r#>>'{rows,0,arrived_at}' is not null;perform public.undo_workbench_operation((r->>'receiptId')::uuid);
end $$;
-- After a previously ordinary file becomes Vault-only, neither the relation
-- nor a known receipt ID may disclose or mutate that hidden relationship.
do $$ declare rev bigint;r jsonb;request_id uuid:=gen_random_uuid();payload jsonb;begin
 select mutation_revision into rev from public.trips where id='73000000-0000-4000-8000-000000000001';
 payload:=jsonb_build_array(jsonb_build_object('id','73000000-0000-4000-8000-000000000001','expected_revision',rev,'document_id','75000000-0000-4000-8000-000000000001','linked',true));
 r:=public.apply_life_field_operation(request_id,'travel_document',payload);
 perform set_config('life.test.hidden_ticket_request',request_id::text,true);
 perform set_config('life.test.hidden_ticket_payload',payload::text,true);
 perform set_config('life.test.hidden_ticket_receipt',r->>'receiptId',true);
end $$;
reset role;
update public.documents set vault_group_id=gen_random_uuid() where id='75000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin
 assert not exists(select 1 from public.trip_documents where document_id='75000000-0000-4000-8000-000000000001'),'hidden endpoint must hide its relation ID';
 begin perform public.read_life_receipt_state(current_setting('life.test.hidden_ticket_receipt')::uuid);raise exception 'known hidden receipt read accepted';exception when insufficient_privilege then null;end;
 begin perform public.undo_workbench_operation(current_setting('life.test.hidden_ticket_receipt')::uuid);raise exception 'known hidden receipt undo accepted';exception when insufficient_privilege then null;end;
 begin perform public.apply_life_field_operation(current_setting('life.test.hidden_ticket_request')::uuid,'travel_document',current_setting('life.test.hidden_ticket_payload')::jsonb);raise exception 'known original hidden request replay accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.documents set vault_group_id=null where id='75000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.save_leisure_content('76000000-0000-4000-8000-000000000001',0,'{"title":"Synthetic book","kind":"book","why":"Fixture","body_markdown":"PRIVATE EDITORIAL BODY","how_to_start":null,"duration_minutes":null,"platform":null,"location":null,"starts_at":null,"cost_text":null,"setting":null,"company":null,"budget":"unknown","sources":[],"ratings":[]}');
select public.save_leisure_feedback('76000000-0000-4000-8000-000000000001',0,'current','liked','PRIVATE PERSONAL NOTE',null);
do $$ declare r jsonb; begin
 r:=public.apply_life_field_operation(gen_random_uuid(),'leisure_progress','[{"id":"76000000-0000-4000-8000-000000000001","expected_revision":1,"progress_unit":"page","progress_value":42,"progress_total":200}]');
 perform public.save_leisure_feedback('76000000-0000-4000-8000-000000000001',2,'current','liked','NEW PERSONAL NOTE',null);
 assert (select progress_value=42 and revision=3 from public.leisure_feedback where experience_id='76000000-0000-4000-8000-000000000001'),'legacy feedback preserves progress/shared monotonic revision';
 begin perform public.undo_workbench_operation((r->>'receiptId')::uuid);raise exception 'stale feedback undo accepted';exception when serialization_failure then null;end;
 r:=public.apply_life_field_operation(gen_random_uuid(),'leisure_progress','[{"id":"76000000-0000-4000-8000-000000000001","expected_revision":3,"progress_unit":null,"progress_value":null,"progress_total":null}]');
 assert (select progress_unit is null and progress_value is null from public.leisure_feedback where experience_id='76000000-0000-4000-8000-000000000001');
 perform public.undo_workbench_operation((r->>'receiptId')::uuid);
 assert (select progress_value=42 and personal_note='NEW PERSONAL NOTE' from public.leisure_feedback where experience_id='76000000-0000-4000-8000-000000000001'),'undo only progress preserves the original note';
 assert not exists(select 1 from public.workspace_action_receipts where before_data::text like '%PERSONAL NOTE%' or after_data::text like '%EDITORIAL BODY%'),'receipt must omit private bodies';
 assert not has_function_privilege('authenticated','public._undo_life_field_operation(uuid)','EXECUTE');
 assert not has_function_privilege('anon','public.apply_life_field_operation(uuid,text,jsonb)','EXECUTE');
end $$;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
do $$ begin assert (select count(*)=0 from public.trip_documents);end $$;
reset role;
-- A real audit INSERT failure rolls back values, revisions and receipts together.
create function public.synthetic_fail_life_audit() returns trigger language plpgsql as $$begin if new.entity_type='life_metadata' then raise exception 'synthetic_audit_failure';end if;return new;end;$$;
create trigger synthetic_fail_life_audit before insert on public.audit_logs for each row execute function public.synthetic_fail_life_audit();
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
do $$ declare rev bigint; receipts bigint; begin
 select mutation_revision into rev from public.purchase_items where id='72000000-0000-4000-8000-000000000001';select count(*) into receipts from public.workspace_action_receipts;
 begin perform public.apply_life_field_operation(gen_random_uuid(),'shopping_quantity',jsonb_build_array(jsonb_build_object('id','72000000-0000-4000-8000-000000000001','expected_revision',rev,'quantity','9','quantity_unit','kg')));raise exception 'audit failure accepted';exception when others then if sqlerrm not like '%synthetic_audit_failure%' then raise;end if;end;
 assert (select mutation_revision=rev and quantity='1' from public.purchase_items where id='72000000-0000-4000-8000-000000000001');assert (select count(*)=receipts from public.workspace_action_receipts);
end $$;
rollback;
