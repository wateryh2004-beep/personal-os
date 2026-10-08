begin;
insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into documents(id,user_id,storage_path) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a/files/c/sealed.pdf'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b/files/d/sealed.pdf');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ declare source uuid; result jsonb; begin
 select reading_source_version into source from documents where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,5,10,0,'11111111-1111-4111-8111-111111111111');
 if result->>'status'<>'saved' or result#>>'{progress,revision}'<>'1' then raise exception 'initial save failed %',result; end if;
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,5,10,0,'11111111-1111-4111-8111-111111111111');
 if result#>>'{progress,revision}'<>'1' then raise exception 'retry is not idempotent'; end if;
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,8,10,0,gen_random_uuid());
 if result->>'status'<>'conflict' or result#>>'{progress,page}'<>'5' then raise exception 'stale device overwrote progress'; end if;
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,2,10,1,gen_random_uuid());
 if result->>'status'<>'saved' or result#>>'{progress,page}'<>'2' then raise exception 'rereading cannot go backwards'; end if;
 begin perform save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,501,501,2,gen_random_uuid()); raise exception 'page limit bypass'; exception when invalid_parameter_value then null; end;
 begin insert into document_reading_progress values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),source,1,1,1,gen_random_uuid(),now(),now()); raise exception 'cross-owner insert'; exception when insufficient_privilege then null; end;
 result := save_document_reading_progress('dddddddd-dddd-4ddd-8ddd-dddddddddddd',source,1,1,0,gen_random_uuid());
 if result->>'status'<>'unavailable' then raise exception 'cross-owner RPC'; end if;
 update documents set storage_path='a/files/c/replaced.pdf' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,3,10,2,gen_random_uuid());
 if result->>'status'<>'source_changed' then raise exception 'old source accepted'; end if;
 select reading_source_version into source from documents where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,1,3,0,gen_random_uuid());
 if result#>>'{progress,revision}'<>'1' then raise exception 'new source not reset'; end if;
 update documents set archived_at=now(),storage_state='archived' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 result := save_document_reading_progress('cccccccc-cccc-4ccc-8ccc-cccccccccccc',source,2,3,1,gen_random_uuid());
 if result->>'status'<>'unavailable' then raise exception 'archived document accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin if exists(select 1 from document_reading_progress) then raise exception 'cross-owner read'; end if; end $$;
set local role anon;
do $$ begin
 begin perform * from document_reading_progress; raise exception 'anon table readable'; exception when insufficient_privilege then null; end;
 begin perform save_document_reading_progress(null,null,1,1,0,gen_random_uuid()); raise exception 'anon RPC callable'; exception when insufficient_privilege then null; end;
end $$;
rollback;
