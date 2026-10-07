begin;
insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into file_folders values('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',null);
set local role anon;
do $$ begin
 begin perform * from file_upload_sessions; raise exception 'anon session readable'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 begin perform * from file_upload_sessions; raise exception 'client provider IDs readable'; exception when insufficient_privilege then null; end;
 begin perform claim_file_upload_operation(auth.uid(),gen_random_uuid(),'complete',gen_random_uuid()); raise exception 'client can claim'; exception when insufficient_privilege then null; end;
 begin perform prepare_file_upload_session(auth.uid(),repeat('a',64),'fixture.pdf','application/pdf',10,repeat('b',64),null,'private-test','pending'); raise exception 'client can prepare'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ declare s file_upload_sessions; repeat_session file_upload_sessions; token uuid:=gen_random_uuid(); begin
 s:=prepare_file_upload_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),'fixture.pdf','application/pdf',10,repeat('b',64),null,'private-test','pending');
 repeat_session:=prepare_file_upload_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),'fixture.pdf','application/pdf',10,repeat('b',64),null,'private-test','pending');
 if s.id<>repeat_session.id then raise exception 'duplicate creation'; end if;
 if claim_file_upload_operation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',s.id,'initialize',token) then raise exception 'wrong owner claim'; end if;
 if not claim_file_upload_operation(s.user_id,s.id,'initialize',token) then raise exception 'cannot initialize'; end if;
 if claim_file_upload_operation(s.user_id,s.id,'abort',gen_random_uuid()) then raise exception 'operation lease bypass'; end if;
 update file_upload_sessions set upload_id='synthetic-only',status='uploading',lease_token=null,lease_expires_at=null where id=s.id and lease_token=token;
 if not claim_file_upload_operation(s.user_id,s.id,'complete',token) then raise exception 'cannot complete'; end if;
 if claim_file_upload_operation(s.user_id,s.id,'abort',gen_random_uuid()) then raise exception 'cancel raced completion'; end if;
 update file_upload_sessions set lease_expires_at=now()-interval '1 second' where id=s.id;
 if not claim_file_upload_operation(s.user_id,s.id,'complete',gen_random_uuid()) then raise exception 'cannot recover expired lease'; end if;
 update file_upload_sessions set status='uploaded',lease_token=null,lease_expires_at=null where id=s.id;
 if claim_file_upload_operation(s.user_id,s.id,'abort',token) then raise exception 'cancelled completed object'; end if;
 if not publish_file_upload_session(s.user_id,s.document_id,s.storage_path,s.user_id::text||'/files/'||s.document_id::text||'/sealed-fixture/fixture.pdf',s.checksum) then raise exception 'cannot atomically publish'; end if;
 if claim_file_upload_operation(s.user_id,s.id,'complete',token) then raise exception 'available mutated'; end if;
 -- An expired completion lease may be canceled, but never published afterward.
 s:=prepare_file_upload_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('d',64),'expired.pdf','application/pdf',10,repeat('b',64),null,'private-test','pending');
 update file_upload_sessions set status='completing',upload_id='expired-synthetic',expires_at=now()-interval '1 second',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '60 seconds' where id=s.id;
 if claim_file_upload_operation(s.user_id,s.id,'abort',token) then raise exception 'live expired-session operation was canceled'; end if;
 update file_upload_sessions set lease_expires_at=now()-interval '1 second' where id=s.id;
 if not claim_file_upload_operation(s.user_id,s.id,'abort',token) then raise exception 'expired completion cannot cancel'; end if;
 if not finish_file_upload_abort(s.user_id,s.id,token) then raise exception 'could not terminalize cancellation'; end if;
 if not finish_file_upload_abort(s.user_id,s.id,token) then raise exception 'cancellation retry not idempotent'; end if;
 if publish_file_upload_session(s.user_id,s.document_id,s.storage_path,s.user_id::text||'/files/'||s.document_id::text||'/sealed-fixture/fixture.pdf',s.checksum) then raise exception 'published canceled session'; end if;
 if (select storage_state from documents where id=s.document_id)<>'cancelled' then raise exception 'cancel lacks terminal evidence'; end if;
 s:=prepare_file_upload_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('e',64),'expired-uploaded.pdf','application/pdf',10,repeat('b',64),null,'private-test','pending');
 update file_upload_sessions set status='uploaded',expires_at=now()-interval '1 second' where id=s.id;
 if not claim_file_upload_operation(s.user_id,s.id,'abort',token) then raise exception 'expired uploaded cannot cancel'; end if;

 begin
 perform prepare_file_upload_session(s.user_id,repeat('c',64),'other.pdf','application/pdf',10,repeat('b',64),'ffffffff-ffff-4fff-8fff-ffffffffffff','private-test','pending');
 raise exception 'foreign folder accepted'; exception when raise_exception then if sqlerrm<>'invalid folder' then raise; end if; end;
end $$;
rollback;
