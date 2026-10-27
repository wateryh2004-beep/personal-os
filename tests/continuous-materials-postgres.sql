-- Disposable schema only. All synthetic fixtures and trigger probes roll back.
begin;
insert into auth.users(id) values('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002');
insert into public.notes(id,user_id,title,body_markdown,status,revision,content_hash) values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Source','A 中文 🌱 source','active',2,encode(sha256(convert_to('A 中文 🌱 source','UTF8')),'hex')),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','Foreign','Foreign body','active',1,null);
insert into public.inbox_items(id,user_id,content_markdown) values
 ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Original Inbox source'),
 ('c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','Foreign Inbox source'),
 ('c3000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','Audit rollback source');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$declare v uuid; repeated uuid; n uuid;begin
 v:=public.capture_note_source('c2000000-0000-4000-8000-000000000001',2,encode(sha256(convert_to('A 中文 🌱 source','UTF8')),'hex'));
 repeated:=public.capture_note_source('c2000000-0000-4000-8000-000000000001',2,encode(sha256(convert_to('A 中文 🌱 source','UTF8')),'hex'));
 assert v=repeated;
 assert (select count(*)=1 from public.note_versions where note_id='c2000000-0000-4000-8000-000000000001' and reason='source_citation');
 update public.notes set body_markdown='Later edited source',revision=3 where id='c2000000-0000-4000-8000-000000000001';
 assert (select body_markdown='A 中文 🌱 source' from public.note_versions where id=v);
 begin perform public.capture_note_source('c2000000-0000-4000-8000-000000000001',2,encode(sha256(convert_to('A 中文 🌱 source','UTF8')),'hex'));raise exception 'TEST stale source accepted';exception when serialization_failure then null;end;
 begin perform public.capture_note_source('c2000000-0000-4000-8000-000000000002',1,'wrong');raise exception 'TEST foreign source accepted';exception when insufficient_privilege then null;end;
 begin update public.note_versions set body_markdown='Tampered' where id=v;raise exception 'TEST immutable source changed';exception when raise_exception then if sqlerrm<>'source_version_is_immutable' then raise;end if;end;
 n:=public.convert_inbox_note('c3000000-0000-4000-8000-000000000001','Converted','Accepted body');
 repeated:=public.convert_inbox_note('c3000000-0000-4000-8000-000000000001','Converted','Accepted body');
 assert n=repeated;
 assert (select converted_note_id=n and processed_at is not null from public.inbox_items where id='c3000000-0000-4000-8000-000000000001');
 assert (select count(*)=1 from public.note_versions where note_id=n);
 begin perform public.convert_inbox_note('c3000000-0000-4000-8000-000000000002','Foreign','Attack');raise exception 'TEST foreign conversion accepted';exception when insufficient_privilege then null;end;
 begin insert into public.todo_creation_receipts(user_id,request_id,request_hash) values(auth.uid(),gen_random_uuid(),repeat('a',64));raise exception 'TEST browser forged dispatch receipt';exception when insufficient_privilege then null;end;
 assert not public.finish_inbox_target('c3000000-0000-4000-8000-000000000003','task','c2000000-0000-4000-8000-000000000001');
end $$;
reset role;
create function public.test_continuous_audit_failure() returns trigger language plpgsql as $$begin if new.action='convert_to_note' then raise exception 'fixture_audit_failed';end if;return new;end $$;
create trigger test_continuous_audit_failure before insert on public.audit_logs for each row execute function public.test_continuous_audit_failure();
set local role authenticated;
do $$begin
 begin perform public.convert_inbox_note('c3000000-0000-4000-8000-000000000003','Atomic rollback','Cannot half-commit');raise exception 'TEST audit failure committed';exception when raise_exception then if sqlerrm<>'fixture_audit_failed' then raise;end if;end;
 assert (select converted_note_id is null and processed_at is null from public.inbox_items where id='c3000000-0000-4000-8000-000000000003');
 assert not exists(select 1 from public.notes where title='Atomic rollback');
end $$;
reset role;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin assert not exists(select 1 from public.note_versions where note_id='c2000000-0000-4000-8000-000000000001');assert not exists(select 1 from public.todo_creation_receipts where user_id='c1000000-0000-4000-8000-000000000001');end $$;
reset role;
rollback;
