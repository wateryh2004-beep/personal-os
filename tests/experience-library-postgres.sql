\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','synthetic-a@example.test'),
 ('22222222-2222-4222-8222-222222222222','synthetic-b@example.test');
insert into public.documents(id,user_id,title,original_filename,storage_path,mime_type,file_size,storage_provider,storage_state)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','synthetic.png','synthetic.png','11111111-1111-4111-8111-111111111111/files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sealed-test/synthetic.png','image/png',10,'cloudflare_r2','available'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','synthetic.png','synthetic.png','22222222-2222-4222-8222-222222222222/files/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/sealed-test/synthetic.png','image/png',10,'cloudflare_r2','available');
insert into public.experience_library_entries(id,user_id,creation_request_id,title) values
 ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-2222-4222-8222-222222222222','Synthetic A'),
 ('bbbbbbbb-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','bbbbbbbb-2222-4222-8222-222222222222','Synthetic B');
insert into public.experience_library_captures(id,user_id,entry_id,request_id,capture_type,raw_content,content_sha256,segments) values
 ('aaaaaaaa-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-4444-4444-8444-444444444444','comment','😀评论 GPA',repeat('a',64),'[{"kind":"comment"}]');
insert into public.experience_library_ai_settings(user_id,provider,model_id,api_key_ciphertext)
values ('11111111-1111-4111-8111-111111111111','deepseek','synthetic-model',repeat('x',50));
set local role service_role;
do $$ begin if (select count(*) from public.experience_library_ai_settings) <> 1 then raise exception 'server credential access unavailable'; end if; end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.experience_library_media(user_id,entry_id,capture_id,document_id,selection_start,selection_end,selection_quote) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',5,8,'GPA');
do $$ begin
 if (select count(*) from public.experience_library_entries) <> 1 then raise exception 'RLS leaked entry'; end if;
 if (select count(*) from public.search_experience_library('GPA')) <> 1 then raise exception 'owner search failed'; end if;
 declare first_result jsonb; retry_result jsonb; payload text := repeat('z',50000);
 begin
   first_result := public.append_experience_library_capture('aaaaaaaa-1111-4111-8111-111111111111',null,'Synthetic A','post',payload,'[{"kind":"post"}]',array[]::text[],'aaaaaaaa-5555-4555-8555-555555555555');
   retry_result := public.append_experience_library_capture('aaaaaaaa-1111-4111-8111-111111111111',null,'Synthetic A','post',payload,'[{"kind":"post"}]',array[]::text[],'aaaaaaaa-5555-4555-8555-555555555555');
   if first_result->>'capture_id' <> retry_result->>'capture_id' then raise exception 'retry created duplicate'; end if;
   if (select char_length(raw_content) from public.experience_library_captures where id=(first_result->>'capture_id')::uuid) <> 50000 then raise exception 'long text truncated'; end if;
   begin
     perform public.append_experience_library_capture('aaaaaaaa-1111-4111-8111-111111111111',null,'Synthetic A','post',payload||'x','[{"kind":"post"}]',array[]::text[],'aaaaaaaa-5555-4555-8555-555555555555');
     raise exception 'changed retry accepted';
   exception when others then if sqlerrm='changed retry accepted' then raise; end if; end;
 end;
 begin
   perform api_key_ciphertext from public.experience_library_ai_settings;
   raise exception 'credential ciphertext exposed';
 exception when insufficient_privilege then null; end;
 begin
   update public.experience_library_ai_settings set model_id='unauthorized';
   raise exception 'settings direct update accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.experience_library_media(user_id,entry_id,document_id) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
   raise exception 'foreign document accepted';
 exception when others then if sqlerrm='foreign document accepted' then raise; end if; end;
 begin
   insert into public.experience_library_captures(user_id,entry_id,request_id,capture_type,raw_content,content_sha256,segments) values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-1111-4111-8111-111111111111',gen_random_uuid(),'post','x',repeat('a',64),'[{}]');
   raise exception 'foreign capture accepted';
 exception when others then if sqlerrm='foreign capture accepted' then raise; end if; end;
 begin
   update public.experience_library_captures set raw_content='changed';
   raise exception 'capture update accepted';
 exception when others then if sqlerrm='capture update accepted' then raise; end if; end;
 begin
   update public.experience_library_media set selection_start=1,selection_end=2,selection_quote='x';
   raise exception 'surrogate split accepted';
 exception when others then if sqlerrm='surrogate split accepted' then raise; end if; end;
end $$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
 if (select count(*) from public.experience_library_media) <> 0 then raise exception 'foreign media visible'; end if;
 if (select count(*) from public.search_experience_library('GPA')) <> 0 then raise exception 'foreign search leaked'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform count(*) from public.experience_library_entries; raise exception 'anonymous read accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
