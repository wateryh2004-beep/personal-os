-- Actual owner/RLS/atomic/projection assertions on the repaired production gap.
-- Caller supplies BEGIN/ROLLBACK; no provider, business history or auth credential is used.
reset role;
do $$begin
 assert(select fingerprint=(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) from public.projects p) from compat_gap_preservation where kind='projects'), 'baseline repair changed canonical projects';
 assert(select fingerprint=(select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) from public.project_workflow_versions v) from compat_gap_preservation where kind='project_versions'), 'baseline repair changed project versions';
 assert(select fingerprint=(select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.search_documents s where s.entity_type<>'project') from compat_gap_preservation where kind='other_search'), 'baseline repair changed other search domains';
 assert exists(select 1 from public.projects where id='e1100000-0000-4000-8000-000000000003' and archived_at is not null), 'archived canonical project lost';
 assert not exists(select 1 from public.search_documents where entity_type='project' and entity_id='e1100000-0000-4000-8000-000000000003'), 'stale archived project projection retained';
 assert not exists(select 1 from public.projects p where p.archived_at is null and not exists(select 1 from public.search_documents s where (s.user_id,s.entity_id)=(p.user_id,p.id) and s.entity_type='project')), 'active project backfill incomplete';
 assert not has_function_privilege('anon','public.complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)','EXECUTE');
 assert not has_function_privilege('anon','public.accept_review_proposal(uuid)','EXECUTE');
 assert not has_function_privilege('anon','public.dismiss_review_proposal(uuid)','EXECUTE');
 assert not has_function_privilege('anon','public.review_source_is_owned(text,uuid,uuid)','EXECUTE');
end $$;
insert into public.notes(id,user_id,title,body_markdown,vault_group_id)
 values('e1200000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Compat ordinary note','Synthetic ordinary source',null),
       ('e1200000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','Compat foreign note','Synthetic foreign source',null),
       ('e1200000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','Compat hidden note','Synthetic hidden source','e1200000-0000-4000-8000-000000000099');
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$begin
 if not exists(select 1 from public.project_workflow_versions where project_id='85000000-0000-4000-8000-000000000001') then
  begin
   delete from public.projects where id='85000000-0000-4000-8000-000000000001';
   assert not exists(select 1 from public.search_documents where entity_type='project' and entity_id='85000000-0000-4000-8000-000000000001');
   raise exception 'synthetic_rollback_project_delete_probe';
  exception when raise_exception then if sqlerrm<>'synthetic_rollback_project_delete_probe' then raise;end if;end;
 else
  begin delete from public.projects where id='85000000-0000-4000-8000-000000000001';raise exception 'TEST project history deletion allowed';
  exception when foreign_key_violation then null;end;
 end if;
 assert exists(select 1 from public.projects where id='85000000-0000-4000-8000-000000000001');
 assert exists(select 1 from public.search_documents where entity_type='project' and entity_id='85000000-0000-4000-8000-000000000001');
end $$;
insert into public.projects(id,user_id,name,description,status) values('e1100000-0000-4000-8000-000000000004',auth.uid(),'Compat newly created project','New owner canonical goal','active');
do $$begin
 assert exists(select 1 from public.search_personal_os('Compat newly created project',50,array['projects']) where entity_id='e1100000-0000-4000-8000-000000000004');
 assert(select count(*)=1 from public.project_workflow_versions where project_id='e1100000-0000-4000-8000-000000000004');
 begin delete from public.projects where id='e1100000-0000-4000-8000-000000000004';raise exception 'TEST new project version lost on delete';exception when foreign_key_violation then null;end;
 assert exists(select 1 from public.search_documents where entity_type='project' and entity_id='e1100000-0000-4000-8000-000000000004');
end $$;
do $$
declare v_receipt jsonb; v_review uuid; v_memory uuid; v_before bigint; v_source jsonb; v_again jsonb; v_kind text; v_decision uuid; v_proposal uuid; v_result uuid;
begin
 assert public.review_source_is_owned('note','e1200000-0000-4000-8000-000000000001',auth.uid());
 assert not public.review_source_is_owned('note','e1200000-0000-4000-8000-000000000002',auth.uid());
 assert not public.review_source_is_owned('note','e1200000-0000-4000-8000-000000000003',auth.uid());
 assert not public.review_source_is_owned('unknown','e1200000-0000-4000-8000-000000000001',auth.uid());
 v_receipt:=public.complete_review_with_sources('daily','compat:daily:2026-10-27','Synthetic daily review','2026-10-27','2026-10-27',E'  Original raw review\n\n', '{"freeReflection":"Original"}',false,
  '[{"sourceType":"note","sourceId":"e1200000-0000-4000-8000-000000000001","sourceRole":"context"},{"sourceType":"project","sourceId":"85000000-0000-4000-8000-000000000001","sourceRole":"cited"}]');
 v_review:=(v_receipt->>'review_id')::uuid;
 assert (v_receipt->>'version_number')::integer=1 and (v_receipt->>'source_count')::integer=2;
 assert(select content_markdown=E'  Original raw review\n\n' and status='completed' and not generated_with_ai from public.reviews where id=v_review);
 v_again:=public.complete_review_with_sources('daily','compat:daily:2026-10-27','Synthetic amended review','2026-10-27','2026-10-27',E'  Amended raw review\n', '{"freeReflection":"Amended"}',true,
  '[{"sourceType":"note","sourceId":"e1200000-0000-4000-8000-000000000001","sourceRole":"cited"}]');
 assert (v_again->>'review_id')::uuid=v_review and (v_again->>'version_number')::integer=2 and (v_again->>'source_count')::integer=1;
 assert(select count(*)=2 from public.review_versions where review_id=v_review);
 assert(select content_markdown=E'  Original raw review\n\n' and reason='completed' from public.review_versions where review_id=v_review and version_number=1);
 assert(select content_markdown=E'  Amended raw review\n' and reason='amended' from public.review_versions where review_id=v_review and version_number=2);
 assert(select generated_with_ai from public.reviews where id=v_review);
 -- Every rejected source must roll the whole call back, including review and version.
 select count(*) into v_before from public.reviews;
 for v_source in select value from jsonb_array_elements('[
  [{"sourceType":"note","sourceId":"e1200000-0000-4000-8000-000000000002","sourceRole":"cited"}],
  [{"sourceType":"note","sourceId":"e1200000-0000-4000-8000-000000000003","sourceRole":"cited"}],
  [{"sourceType":"note","sourceId":"e1200000-0000-4000-8000-000000000001","sourceRole":"origin"}]
 ]'::jsonb) loop
  begin
   perform public.complete_review_with_sources('daily','compat:invalid-source','Must not save','2026-10-27','2026-10-27','Must roll back','{}',false,v_source);
   raise exception 'TEST invalid review source accepted';
  exception when raise_exception then if sqlerrm<>'invalid or unowned review source' then raise;end if;end;
  assert(select count(*)=v_before from public.reviews);
 end loop;
 begin
  perform public.complete_review_with_sources('daily','compat:invalid-period','Must not save','2026-10-28','2026-10-27','Must roll back','{}',false,'[]');
  raise exception 'TEST invalid review period accepted';
 exception when check_violation then null;end;
 assert(select count(*)=v_before from public.reviews);
 insert into public.review_proposals(id,user_id,review_id,proposal_type,payload)
  values('e1300000-0000-4000-8000-000000000001',auth.uid(),v_review,'profile_memory','{"title":"Compat explicit profile","content":"Synthetic owner-approved content","rationale":"Synthetic rationale","evidenceSourceIds":["e1200000-0000-4000-8000-000000000001"]}');
 select count(*) into v_before from public.personal_memories;
 v_receipt:=public.accept_review_proposal('e1300000-0000-4000-8000-000000000001');v_memory:=(v_receipt->>'resulting_entity_id')::uuid;
 assert v_receipt->>'resulting_entity_type'='personal_memory';
 assert(select user_id=auth.uid() and content='Synthetic owner-approved content' from public.personal_memories where id=v_memory);
 assert(select count(*)=v_before+1 from public.personal_memories);
 assert(select status='accepted' and resulting_entity_id=v_memory and resolved_at is not null from public.review_proposals where id='e1300000-0000-4000-8000-000000000001');
 assert(select count(*)=1 from public.memory_sources where memory_id=v_memory and source_id='e1200000-0000-4000-8000-000000000001' and source_role='evidence');
 assert(select count(*)=1 from public.audit_logs where entity_id='e1300000-0000-4000-8000-000000000001' and action='review_proposal_accept');
 begin perform public.accept_review_proposal('e1300000-0000-4000-8000-000000000001');raise exception 'TEST proposal accepted twice';
 exception when raise_exception then if sqlerrm<>'proposal already resolved' then raise;end if;end;
 assert(select count(*)=v_before+1 from public.personal_memories);
 insert into public.review_proposals(id,user_id,review_id,proposal_type,payload)
  values('e1300000-0000-4000-8000-000000000002',auth.uid(),v_review,'profile_memory','{"title":"Dismissed","content":"Must not become memory"}'),
        ('e1300000-0000-4000-8000-000000000003',auth.uid(),v_review,'working_memory','{"title":"Missing review date","content":"Must not become memory"}');
 assert public.dismiss_review_proposal('e1300000-0000-4000-8000-000000000002')='e1300000-0000-4000-8000-000000000002';
 assert(select status='dismissed' and resolved_at is not null from public.review_proposals where id='e1300000-0000-4000-8000-000000000002');
 assert(select count(*)=1 from public.audit_logs where entity_id='e1300000-0000-4000-8000-000000000002' and action='review_proposal_dismiss');
 begin perform public.dismiss_review_proposal('e1300000-0000-4000-8000-000000000002');raise exception 'TEST proposal dismissed twice';
 exception when raise_exception then if sqlerrm<>'pending proposal not found' then raise;end if;end;
 begin perform public.accept_review_proposal('e1300000-0000-4000-8000-000000000003');raise exception 'TEST working memory date omitted';
 exception when raise_exception then if sqlerrm<>'working memory review date required' then raise;end if;end;
 assert(select count(*)=v_before+1 from public.personal_memories);
 assert(select status='pending' from public.review_proposals where id='e1300000-0000-4000-8000-000000000003');
 insert into public.review_proposals(id,user_id,review_id,proposal_type,payload)
  values('e1300000-0000-4000-8000-000000000005',auth.uid(),v_review,'working_memory','{"title":"Bounded working memory","content":"Explicit synthetic focus","reviewAt":"2099-01-01T00:00:00Z","evidenceSourceIds":[]}');
 v_receipt:=public.accept_review_proposal('e1300000-0000-4000-8000-000000000005');
 assert(select memory_type='working' and review_at='2099-01-01T00:00:00Z'::timestamptz from public.personal_memories where id=(v_receipt->>'resulting_entity_id')::uuid);
 foreach v_kind in array array['decision_keep','decision_supersede','decision_reverse'] loop
  v_decision:=case v_kind when 'decision_keep' then 'e1400000-0000-4000-8000-000000000001'::uuid when 'decision_supersede' then 'e1400000-0000-4000-8000-000000000002'::uuid else 'e1400000-0000-4000-8000-000000000003'::uuid end;
  v_proposal:=case v_kind when 'decision_keep' then 'e1300000-0000-4000-8000-000000000011'::uuid when 'decision_supersede' then 'e1300000-0000-4000-8000-000000000012'::uuid else 'e1300000-0000-4000-8000-000000000013'::uuid end;
  insert into public.decisions(id,user_id,title,decision_text,context_markdown) values(v_decision,auth.uid(),'Synthetic original decision','Original explicit judgment','Original context');
  insert into public.review_sources(user_id,review_id,source_type,source_id,source_role) values(auth.uid(),v_review,'decision',v_decision,'context');
  insert into public.review_proposals(id,user_id,review_id,proposal_type,payload) values(v_proposal,auth.uid(),v_review,v_kind,jsonb_build_object('decisionId',v_decision,'title','Synthetic changed decision','content','New explicit judgment','rationale','Synthetic reason','evidenceSourceIds',jsonb_build_array('e1200000-0000-4000-8000-000000000001')));
  v_receipt:=public.accept_review_proposal(v_proposal);v_result:=(v_receipt->>'resulting_entity_id')::uuid;
  assert v_receipt->>'resulting_entity_type'='decision';
  assert(select decision_text='Original explicit judgment' and last_reviewed_at is not null and status=case v_kind when 'decision_keep' then 'active' when 'decision_supersede' then 'superseded' else 'reversed' end from public.decisions where id=v_decision);
  if v_kind='decision_keep' then assert v_result=v_decision;
  else assert(select supersedes_decision_id=v_decision and context_markdown='Original context' and decision_text='New explicit judgment' and status='active' from public.decisions where id=v_result);end if;
  assert(select count(*)=1 from public.audit_logs where entity_id=v_proposal and action='review_proposal_accept');
 end loop;
end $$;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
do $$begin
 assert not exists(select 1 from public.reviews where review_key='compat:daily:2026-10-27');
 begin perform public.accept_review_proposal('e1300000-0000-4000-8000-000000000003');raise exception 'TEST foreign proposal accepted';
 exception when raise_exception then if sqlerrm<>'proposal not found' then raise;end if;end;
 begin perform public.dismiss_review_proposal('e1300000-0000-4000-8000-000000000003');raise exception 'TEST foreign proposal dismissed';
 exception when raise_exception then if sqlerrm<>'pending proposal not found' then raise;end if;end;
 assert not exists(select 1 from public.search_personal_os('Synthetic project',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
 assert exists(select 1 from public.search_personal_os('Compat foreign project',50,array['projects']) where entity_id='e1100000-0000-4000-8000-000000000002');
 begin perform public.save_project_workflow('85000000-0000-4000-8000-000000000001',1,'Foreign overwrite','',null);raise exception 'TEST foreign project changed';
 exception when raise_exception then if sqlerrm<>'workflow_missing' then raise;end if;end;
end $$;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
-- Failure injection uses only disposable trigger names and fixed synthetic errors.
reset role;
set local role anon;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
do $$begin
 begin perform public.review_source_is_owned('project','85000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001');raise exception 'TEST anonymous helper execution allowed';exception when insufficient_privilege then null;end;
 begin perform public.complete_review_with_sources('daily','compat:anon','Denied','2026-10-27','2026-10-27','Denied','{}',false,'[]');raise exception 'TEST anonymous completion allowed';exception when insufficient_privilege then null;end;
 begin perform public.accept_review_proposal('e1300000-0000-4000-8000-000000000003');raise exception 'TEST anonymous accept allowed';exception when insufficient_privilege then null;end;
 begin perform public.dismiss_review_proposal('e1300000-0000-4000-8000-000000000003');raise exception 'TEST anonymous dismiss allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
create function public.synthetic_compat_version_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_compat_version_failure';end $$;
create trigger synthetic_compat_version_failure before insert on public.review_versions for each row execute function public.synthetic_compat_version_failure();
set local role authenticated;
do $$declare v_review uuid;begin
 select id into v_review from public.reviews where review_key='compat:daily:2026-10-27' and user_id=auth.uid();
 begin perform public.complete_review_with_sources('daily','compat:daily:2026-10-27','Must not overwrite','2026-10-27','2026-10-27','Must roll back','{}',false,'[]');raise exception 'TEST failed version save accepted';
 exception when raise_exception then if sqlerrm<>'synthetic_compat_version_failure' then raise;end if;end;
 assert(select content_markdown=E'  Amended raw review\n' and generated_with_ai from public.reviews where id=v_review);
 assert(select count(*)=2 from public.review_versions where review_id=v_review);
 assert(select count(*)=1 from public.review_sources where review_id=v_review and source_role='cited');
end $$;
reset role;
drop trigger synthetic_compat_version_failure on public.review_versions;
drop function public.synthetic_compat_version_failure();
create function public.synthetic_compat_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_compat_audit_failure';end $$;
create trigger synthetic_compat_audit_failure before insert on public.audit_logs for each row when(new.action in('review_proposal_accept','review_proposal_dismiss')) execute function public.synthetic_compat_audit_failure();
set local role authenticated;
do $$declare v_review uuid;v_before bigint;begin
 select id into v_review from public.reviews where review_key='compat:daily:2026-10-27' and user_id=auth.uid();
 insert into public.review_proposals(id,user_id,review_id,proposal_type,payload) values('e1300000-0000-4000-8000-000000000004',auth.uid(),v_review,'profile_memory','{"title":"Atomic failed memory","content":"Must roll back"}');
 select count(*) into v_before from public.personal_memories;
 begin perform public.accept_review_proposal('e1300000-0000-4000-8000-000000000004');raise exception 'TEST accept audit failure ignored';
 exception when raise_exception then if sqlerrm<>'synthetic_compat_audit_failure' then raise;end if;end;
 assert(select count(*)=v_before from public.personal_memories);
 assert(select status='pending' and resulting_entity_id is null from public.review_proposals where id='e1300000-0000-4000-8000-000000000004');
 begin perform public.dismiss_review_proposal('e1300000-0000-4000-8000-000000000004');raise exception 'TEST dismiss audit failure ignored';
 exception when raise_exception then if sqlerrm<>'synthetic_compat_audit_failure' then raise;end if;end;
 assert(select status='pending' and resolved_at is null from public.review_proposals where id='e1300000-0000-4000-8000-000000000004');
end $$;
reset role;
drop trigger synthetic_compat_audit_failure on public.audit_logs;
drop function public.synthetic_compat_audit_failure();
set local role authenticated;
do $$declare v_revision bigint;v_versions bigint;begin
 assert exists(select 1 from public.search_personal_os('Synthetic project',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
 select mutation_revision into v_revision from public.projects where id='85000000-0000-4000-8000-000000000001';
 perform public.save_project_workflow('85000000-0000-4000-8000-000000000001',v_revision,'Compat changed canonical goal','',null);
 assert exists(select 1 from public.search_personal_os('Compat changed canonical goal',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
 begin perform public.save_project_workflow('85000000-0000-4000-8000-000000000001',v_revision,'Stale goal','',null);raise exception 'TEST stale project baseline accepted';
 exception when raise_exception then if sqlerrm<>'workflow_conflict' then raise;end if;end;
 assert(select description='Compat changed canonical goal' from public.projects where id='85000000-0000-4000-8000-000000000001');
 update public.projects set name='Compat renamed canonical project' where id='85000000-0000-4000-8000-000000000001';
 assert exists(select 1 from public.search_personal_os('Compat renamed canonical project',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
 select count(*) into v_versions from public.project_workflow_versions where project_id='85000000-0000-4000-8000-000000000001';
 update public.projects set archived_at=now() where id='85000000-0000-4000-8000-000000000001';
 assert not exists(select 1 from public.search_documents where entity_type='project' and entity_id='85000000-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.search_personal_os('Compat renamed canonical project',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
 assert(select count(*)>=v_versions from public.project_workflow_versions where project_id='85000000-0000-4000-8000-000000000001');
 update public.projects set archived_at=null where id='85000000-0000-4000-8000-000000000001';
 assert exists(select 1 from public.search_personal_os('Compat renamed canonical project',50,array['projects']) where entity_id='85000000-0000-4000-8000-000000000001');
end $$;
reset role;
