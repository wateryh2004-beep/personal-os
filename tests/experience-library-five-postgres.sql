\set ON_ERROR_STOP on
begin;
insert into public.experience_library_entries(id,user_id,title) select (lpad(to_hex(i),8,'0')||'-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::uuid,'11111111-1111-4111-8111-111111111111','合成经验 '||i from generate_series(1,80) i;
insert into public.experience_library_captures(id,user_id,entry_id,raw_content) values ('aaaaaaaa-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa','只在子记录里的经验原文');
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ begin
 if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 0)) <> 21 then raise exception 'page one count'; end if;
 if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 21)) <> 21 then raise exception 'page two count'; end if;
 if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 60)) <> 21 then raise exception 'results beyond 60 missing'; end if;
 if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 80)) <> 1 then raise exception 'last result missing'; end if;
end $$;
select public.set_experience_library_merge('00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
 if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 21)) <> 21 then raise exception 'merged child still listed'; end if;
 if (select merged_count from public.search_experience_library_v3('合成经验 2') where id='00000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then raise exception 'merge count'; end if;
 if (select count(*) from public.search_experience_library_v3('只在子记录里的经验原文')) <> 1 then raise exception 'merged original not searchable'; end if;
 if (select count(*) from public.audit_logs where action='merge') <> 1 then raise exception 'merge audit missing'; end if;
end $$;
select public.undo_experience_library_merge('00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin if (select count(*) from public.search_experience_library_v3('', '', '', false, false, 'created', 21)) <> 21 then raise exception 'undo failed'; end if; if (select count(*) from public.audit_logs where action='unmerge') <> 1 then raise exception 'undo audit missing'; end if;
 begin update public.experience_library_entries set merged_into_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; raise exception 'foreign group accepted'; exception when others then if sqlerrm='foreign group accepted' then raise; end if; end; end $$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
 if (select count(*) from public.search_experience_library_v3('合成经验')) <> 0 then raise exception 'foreign search'; end if;
 begin perform public.set_experience_library_merge('00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'foreign merge accepted'; exception when others then if sqlerrm='foreign merge accepted' then raise; end if; end;
end $$;
rollback;
-- A separate rollback-only transaction checks owner-scoped action reviews.
begin;
insert into public.experience_library_task_links(user_id,entry_id,todo_task_id) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-5555-4555-8555-555555555555');
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.record_experience_action_review('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-5555-4555-8555-555555555555','aaaaaaaa-6666-4666-8666-666666666666','effective','合成复盘');
select public.record_experience_action_review('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-5555-4555-8555-555555555555','aaaaaaaa-6666-4666-8666-666666666666','effective','合成复盘');
select public.mark_experience_library_reviewed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
 if (select count(*) from public.experience_library_action_reviews) <> 1 then raise exception 'idempotent review failed'; end if;
 if (select count(*) from public.audit_logs where action='action_review') <> 1 then raise exception 'review audit duplicated'; end if;
 if (select count(*) from public.audit_logs where action='reviewed') <> 1 then raise exception 'freshness audit missing'; end if;
 begin
  insert into public.experience_library_action_reviews(user_id,entry_id,todo_task_id,request_id,verdict,note) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-5555-4555-8555-555555555555','aaaaaaaa-7777-4777-8777-777777777777','effective','wrong');
  raise exception 'foreign task review accepted';
 exception when others then if sqlerrm='foreign task review accepted' then raise; end if; end;
end $$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin if (select count(*) from public.experience_library_action_reviews) <> 0 then raise exception 'cross owner review leaked'; end if; end $$;
rollback;
