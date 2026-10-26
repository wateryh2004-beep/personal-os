-- Run only against the disposable full-migration PostgreSQL test database.
-- Every fixture and DDL change is rolled back. No network/provider access.
begin;
insert into auth.users(id) values('11000000-0000-4000-8000-000000000001'),('11000000-0000-4000-8000-000000000002');
insert into public.notes(id,user_id,title,body_markdown,status,revision) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Original','PRIVATE FIXTURE BODY','active',1),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Second','SECOND FIXTURE BODY','active',1),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','Foreign','FOREIGN FIXTURE BODY','active',1);
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare result jsonb; replay jsonb; original_revision bigint; request uuid:=gen_random_uuid();
begin
 begin
  perform public._record_workbench_receipt(auth.uid(),gen_random_uuid(),md5('fake'),'note_move','21000000-0000-4000-8000-000000000001','{}','{}',0);
  raise exception 'TEST fake receipt accepted';
 exception when insufficient_privilege then null; end;
 result:=public.apply_workbench_metadata(request,'note_rename','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":0,"title":"Renamed"}]');
 assert (select title='Renamed' and revision=2 and mutation_revision=1 from public.notes where id='21000000-0000-4000-8000-000000000001');
 assert (select count(*)=1 from public.note_versions where note_id='21000000-0000-4000-8000-000000000001' and title='Original' and body_markdown='PRIVATE FIXTURE BODY');
 assert (select before_data::text not like '%PRIVATE FIXTURE BODY%' from public.workspace_action_receipts where id=(result->>'receiptId')::uuid);
 replay:=public.apply_workbench_metadata(request,'note_rename','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":0,"title":"Renamed"}]');
 assert (replay->>'replayed')::boolean and replay->'rows'='[]'::jsonb;
 perform public.undo_workbench_operation((result->>'receiptId')::uuid);
 assert (select title='Original' and revision=3 and mutation_revision=2 from public.notes where id='21000000-0000-4000-8000-000000000001');
 perform public.undo_workbench_operation((result->>'receiptId')::uuid);
 assert (select mutation_revision=2 from public.notes where id='21000000-0000-4000-8000-000000000001');
 replay:=public.apply_workbench_metadata(request,'note_rename','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":0,"title":"Renamed"}]');
 assert replay->>'receiptStatus'='undone' and replay->'rows'='[]'::jsonb;
 begin
  perform public.apply_workbench_metadata(request,'note_rename','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":2,"title":"Different"}]');raise exception 'TEST request reuse accepted';
 exception when raise_exception then if sqlerrm not like '%request_conflict%' then raise;end if;end;
 begin
  perform public.apply_workbench_metadata(gen_random_uuid(),'note_move','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":2,"folderId":null},{"id":"21000000-0000-4000-8000-000000000002","expectedRevision":999,"folderId":null}]');raise exception 'TEST batch stale accepted';
 exception when raise_exception then if sqlerrm not like '%conflict%' then raise;end if;end;
 assert (select mutation_revision=2 from public.notes where id='21000000-0000-4000-8000-000000000001');
 begin
  perform public.apply_workbench_metadata(gen_random_uuid(),'note_rename','[{"id":"21000000-0000-4000-8000-000000000003","expectedRevision":0,"title":"Attack"}]');raise exception 'TEST cross owner accepted';
 exception when raise_exception then if sqlerrm not like '%missing%' then raise;end if;end;
 result:=public.apply_workbench_metadata(gen_random_uuid(),'note_move','[{"id":"21000000-0000-4000-8000-000000000001","expectedRevision":2,"folderId":null}]');
 update public.notes set title='ABA' where id='21000000-0000-4000-8000-000000000001';update public.notes set title='Original' where id='21000000-0000-4000-8000-000000000001';
 begin perform public.undo_workbench_operation((result->>'receiptId')::uuid);raise exception 'TEST ABA undo accepted';exception when raise_exception then if sqlerrm not like '%conflict%' then raise;end if;end;
 assert (select title='Original' and mutation_revision=5 from public.notes where id='21000000-0000-4000-8000-000000000001');
end $$;
reset role;
create function public.test_workbench_audit_failure() returns trigger language plpgsql as $$begin if new.action='note_move' then raise exception 'fixture_audit_failure';end if;return new;end $$;
create trigger test_workbench_audit_failure before insert on public.audit_logs for each row execute function public.test_workbench_audit_failure();
set local role authenticated;
do $$begin
 begin perform public.apply_workbench_metadata(gen_random_uuid(),'note_move','[{"id":"21000000-0000-4000-8000-000000000002","expectedRevision":0,"folderId":null}]');raise exception 'TEST failed audit accepted';exception when raise_exception then if sqlerrm not like '%fixture_audit_failure%' then raise;end if;end;
 assert (select mutation_revision=0 from public.notes where id='21000000-0000-4000-8000-000000000002');
end $$;
reset role;
drop trigger test_workbench_audit_failure on public.audit_logs;
insert into public.documents(id,user_id,title,original_filename,storage_path,mime_type,file_size,storage_provider,storage_state) values('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Original file','fixture.pdf','11000000-0000-4000-8000-000000000001/fixture.pdf','application/pdf',10,'cloudflare_r2','available');
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.apply_workbench_metadata(gen_random_uuid(),'file_archive','[{"id":"31000000-0000-4000-8000-000000000001","expectedRevision":0}]');
 perform set_config('test.receipt',result->>'receiptId',true);
 begin perform public.undo_workbench_operation((result->>'receiptId')::uuid);raise exception 'TEST unchecked original restored';exception when raise_exception then if sqlerrm not like '%original_unverified%' then raise;end if;end;
 begin insert into public.workspace_original_checks(receipt_id,document_id,user_id,mutation_revision) values((result->>'receiptId')::uuid,'31000000-0000-4000-8000-000000000001',auth.uid(),1);raise exception 'TEST browser forged original proof';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.workspace_original_checks(receipt_id,document_id,user_id,mutation_revision) values(current_setting('test.receipt')::uuid,'31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',1);
set local role authenticated;
select public.undo_workbench_operation(current_setting('test.receipt')::uuid);
do $$begin assert (select storage_state='available' and archived_at is null and mutation_revision=2 from public.documents where id='31000000-0000-4000-8000-000000000001');end $$;
reset role;
do $$begin assert not exists(select 1 from public.workspace_original_checks where receipt_id=current_setting('test.receipt')::uuid);end $$;
-- Later privacy changes must revoke direct authenticated receipt reads, including
-- a mixed visible/hidden batch, Graph endpoints and historical folder references.
insert into public.notes(id,user_id,title,status) values
 ('21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','Batch private','active'),
 ('21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000001','Batch visible','active');
insert into public.file_folders(id,user_id,name) values('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Historical private folder');
insert into public.documents(id,user_id,title,original_filename,storage_path,mime_type,file_size,storage_provider,storage_state,folder_id) values
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Public now','fixture.pdf','11000000-0000-4000-8000-000000000001/folder.pdf','application/pdf',10,'cloudflare_r2','available','41000000-0000-4000-8000-000000000001'),
 ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','Private later','fixture.pdf','11000000-0000-4000-8000-000000000001/private.pdf','application/pdf',10,'cloudflare_r2','available',null);
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.apply_workbench_metadata(gen_random_uuid(),'note_rename','[{"id":"21000000-0000-4000-8000-000000000004","expectedRevision":0,"title":"Private changed"},{"id":"21000000-0000-4000-8000-000000000005","expectedRevision":0,"title":"Visible changed"}]');
 perform set_config('test.private_batch',result->>'receiptId',true);
 result:=public.apply_workbench_metadata(gen_random_uuid(),'file_rename','[{"id":"31000000-0000-4000-8000-000000000003","expectedRevision":0,"title":"Private changed"}]');
 perform set_config('test.private_file',result->>'receiptId',true);
 result:=public.apply_workbench_metadata(gen_random_uuid(),'file_move','[{"id":"31000000-0000-4000-8000-000000000002","expectedRevision":0,"folderId":null}]');
 perform set_config('test.private_folder',result->>'receiptId',true);
 result:=public.apply_workbench_link(gen_random_uuid(),'note','21000000-0000-4000-8000-000000000005','document','31000000-0000-4000-8000-000000000003');
 perform set_config('test.private_link',result->>'receiptId',true);
 perform set_config('test.private_link_target',(result->'rows'->0->>'id'),true);
 assert not has_function_privilege('authenticated','public._workbench_entity_owned(uuid,text,uuid)','execute');
 assert not has_function_privilege('anon','public._workbench_receipt_visible(uuid,text,uuid,jsonb,jsonb)','execute');
 assert not public._workbench_receipt_visible('11000000-0000-4000-8000-000000000002','graph_link',(result->>'receiptId')::uuid,'{}','{}');
 assert (select public._workbench_receipt_visible(user_id,operation,target_id,before_data,after_data) from public.workspace_action_receipts where id=current_setting('test.private_link')::uuid);
 assert (select count(*)=4 from public.workspace_action_receipts where id in(current_setting('test.private_batch')::uuid,current_setting('test.private_file')::uuid,current_setting('test.private_folder')::uuid,current_setting('test.private_link')::uuid));
end $$;
reset role;
update public.notes set vault_group_id=gen_random_uuid() where id='21000000-0000-4000-8000-000000000004';
update public.documents set vault_group_id=gen_random_uuid() where id='31000000-0000-4000-8000-000000000003';
update public.file_folders set vault_group_id=gen_random_uuid() where id='41000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin
 assert not public._workbench_receipt_visible(auth.uid(),'graph_link',current_setting('test.private_link_target')::uuid,'{}','{}');
 assert not exists(select 1 from public.workspace_action_receipts where id in(current_setting('test.private_batch')::uuid,current_setting('test.private_file')::uuid,current_setting('test.private_folder')::uuid,current_setting('test.private_link')::uuid));
 assert exists(select 1 from public.notes where id='21000000-0000-4000-8000-000000000005');
 assert exists(select 1 from public.documents where id='31000000-0000-4000-8000-000000000002');
 begin perform public.undo_workbench_operation(current_setting('test.private_batch')::uuid);raise exception 'TEST hidden receipt undo accepted';exception when raise_exception then if sqlerrm not like '%missing%' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS local receipts: forged/cross-owner denial, versions/editor revision, retry/replay/undo idempotency, batch rollback, ABA, transactional audit failure' as result;
