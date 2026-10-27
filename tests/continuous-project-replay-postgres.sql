-- NOT EXECUTED. Planned synthetic native counterexample, not a passed test.
-- Prerequisite: disposable full-migration DB + continuous upgrade-seed.sql.
-- On the frozen candidate the changed-payload calls silently return the first
-- note and the TEST assertion fails. Correct implementation rejects each as a
-- serialization conflict and creates no second note/version/audit.
begin;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
insert into public.inbox_items(id,user_id,content_markdown)
values('ed300000-0000-4000-8000-000000000001',auth.uid(),'Synthetic project replay source');
do $$
declare note uuid; notes_before bigint; versions_before bigint; audits_before bigint;
begin
 note:=public.convert_inbox_project('ed300000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','First title','First body');
 assert public.convert_inbox_project('ed300000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','First title','First body')=note;
 select count(*) into notes_before from public.notes;
 select count(*) into versions_before from public.note_versions;
 select count(*) into audits_before from public.audit_logs;
 begin
  perform public.convert_inbox_project('ed300000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','Changed title','First body');
  raise exception 'TEST different title accepted as saved';
 exception when serialization_failure then null;
 end;
 begin
  perform public.convert_inbox_project('ed300000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','First title','Changed body');
  raise exception 'TEST different body accepted as saved';
 exception when serialization_failure then null;
 end;
 assert(select count(*)=notes_before from public.notes);
 assert(select count(*)=versions_before from public.note_versions);
 assert(select count(*)=audits_before from public.audit_logs);
 assert(select title='First title' and body_markdown='First body' from public.notes where id=note);
end $$;
rollback;
