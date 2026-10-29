\set ON_ERROR_STOP on
begin;
insert into public.experience_library_captures(id,user_id,entry_id,raw_content) values ('aaaaaaaa-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','合成原文：专业题需要准备');
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.save_experience_library_reading_document('aaaaaaaa-3333-4333-8333-333333333333','阅读版','## 要点\n准备专业题','[{"type":"capture","id":"aaaaaaaa-3333-4333-8333-333333333333","quote":"专业题需要准备"}]','keep','','partial',0);
select public.save_experience_library_reading_document('aaaaaaaa-3333-4333-8333-333333333333','阅读版修订','## 要点\n再次核对','[{"type":"capture","id":"aaaaaaaa-3333-4333-8333-333333333333","quote":"专业题需要准备"}]','pending_delete','已被另一篇完整覆盖','partial',1);
do $$ begin
 if (select revision from public.experience_library_reading_documents where capture_id='aaaaaaaa-3333-4333-8333-333333333333')<>2 then raise exception 'revision not advanced'; end if;
 if (select count(*) from public.experience_library_reading_versions where capture_id='aaaaaaaa-3333-4333-8333-333333333333')<>1 then raise exception 'old version missing'; end if;
 if (select count(*) from public.audit_logs where action like 'reading_document_%')<>2 then raise exception 'audit missing'; end if;
 begin
  perform public.save_experience_library_reading_document('aaaaaaaa-3333-4333-8333-333333333333','bad','x','[{"type":"capture","id":"aaaaaaaa-3333-4333-8333-333333333333","quote":"not in original"}]','keep','','complete',2);
  raise exception 'unsupported quote accepted';
 exception when others then if sqlerrm='unsupported quote accepted' then raise; end if; end;
 begin
  perform public.save_experience_library_reading_document('aaaaaaaa-3333-4333-8333-333333333333','stale','x','[{"type":"capture","id":"aaaaaaaa-3333-4333-8333-333333333333","quote":"专业题需要准备"}]','keep','','complete',1);
  raise exception 'stale revision accepted';
 exception when others then if sqlerrm='stale revision accepted' then raise; end if; end;
end $$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin if (select count(*) from public.experience_library_reading_documents)<>0 then raise exception 'cross-owner reading leaked'; end if; end $$;
rollback;
