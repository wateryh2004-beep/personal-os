\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
insert into public.career_opportunities(id,user_id,organization,role_title,opportunity_type,source_url,recruitment_cycle) values('8d000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic material org','Synthetic role','internship','https://synthetic.invalid/job','2027');
insert into public.documents(id,user_id,title,original_filename,storage_bucket,storage_path,mime_type,file_size,storage_provider,storage_state) values('8c000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic exact material','material.pdf','synthetic','81000000-0000-4000-8000-000000000001/material.pdf','application/pdf',123,'cloudflare_r2','available');
insert into public.career_material_checks(id,user_id,opportunity_id,label,document_id,note,verified_at,verified_object_revision) select '8e000000-0000-4000-8000-000000000001',auth.uid(),'8d000000-0000-4000-8000-000000000001','Synthetic existing verification',id,'Original note','2026-10-01T00:00:00Z','document:'||id::text||':'||mutation_revision::text from public.documents where id='8c000000-0000-4000-8000-000000000001';
insert into public.resume_versions(id,user_id,title,status,updated_at) values('8f000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic approved resume','approved','2026-10-27T00:00:00.123456+00:00');
set local role authenticated;
do $$ declare m public.career_material_checks;doc_rev bigint;old_time timestamptz;r public.task_planning;p public.projects;a public.planning_availability;s public.purchase_items;e public.briefing_events;begin
 r:=public.save_task_planning('84000000-0000-4000-8000-000000000001',0,37,'2026-10-27');
 assert r.revision=1 and r.estimated_minutes=37;
 begin perform public.save_task_planning(r.task_id,0,99,'2026-10-27');raise exception 'stale estimate accepted';exception when others then if sqlerrm<>'workflow_conflict' then raise;end if;end;
 begin perform public.save_task_planning(r.task_id,null,99,'2026-10-27');raise exception 'null revision accepted';exception when others then if sqlerrm<>'workflow_invalid' then raise;end if;end;
 a:=public.save_planning_availability('2026-10-27','Asia/Shanghai',0,'[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]');assert a.revision=1;
 begin insert into public.planning_availability(user_id,local_date,timezone,periods) values(auth.uid(),'2026-10-28','Asia/Shanghai','[{"start":"12:00","end":"11:00"}]');raise exception 'raw malformed periods accepted';exception when others then if sqlerrm<>'workflow_invalid' then raise;end if;end;
 begin insert into public.planning_availability(user_id,local_date,timezone,periods) values(auth.uid(),'2026-10-28','UTC','[{"start":null,"end":"12:00"}]');raise exception 'raw null period accepted';exception when others then if sqlerrm<>'workflow_invalid' then raise;end if;end;
 p:=public.save_project_workflow('85000000-0000-4000-8000-000000000001',1,'Updated goal','Waiting for my input','84000000-0000-4000-8000-000000000001');assert p.description='Updated goal' and p.mutation_revision=2;
 begin perform public.save_project_workflow(p.id,1,'Overwritten','','84000000-0000-4000-8000-000000000001');raise exception 'stale project accepted';exception when others then if sqlerrm<>'workflow_conflict' then raise;end if;end;
 assert (select count(*)=1 from public.project_workflow_versions where project_id=p.id and description='Original goal');
 assert (select count(*)=1 from public.feed_item_versions where feed_item_id='87000000-0000-4000-8000-000000000001' and content_text='Original exact source text');
 update public.feed_items set content_text='Observed replacement text' where id='87000000-0000-4000-8000-000000000001';
 assert (select count(*)=2 from public.feed_item_versions where feed_item_id='87000000-0000-4000-8000-000000000001');
 update public.feed_items set fetched_at=now() where id='87000000-0000-4000-8000-000000000001';
 assert (select count(*)=2 from public.feed_item_versions where feed_item_id='87000000-0000-4000-8000-000000000001'),'fetch timestamp alone is not a source content update';
 e:=public.save_briefing_event_source('89000000-0000-4000-8000-000000000001',0,'User grouped event','87000000-0000-4000-8000-000000000001',true);assert e.revision=1;
 e:=public.save_briefing_event_source(e.id,1,e.title,'87000000-0000-4000-8000-000000000001',false);assert e.revision=2;
 assert (select count(*)=2 from public.feed_item_versions where feed_item_id='87000000-0000-4000-8000-000000000001'),'un-grouping never deletes original snapshots';
 s:=public.save_purchase_aftercare('88000000-0000-4000-8000-000000000001',1,'2026-10-27','2026-11-02',null,'Synthetic order','User recorded deadline',null,'receipt');assert s.status='purchased' and s.purchased_on='2026-10-27';
 begin perform public.save_purchase_aftercare(s.id,s.mutation_revision,'2026-10-27','2026-10-01',null,'','',null,'receipt');raise exception 'earlier return date accepted';exception when check_violation then null;end;
 select mutation_revision into doc_rev from public.documents where id='8c000000-0000-4000-8000-000000000001';
 m:=public.save_career_material_check('8e000000-0000-4000-8000-000000000001','8d000000-0000-4000-8000-000000000001',1,'Synthetic existing verification',true,'8c000000-0000-4000-8000-000000000001',null,'Only note changed','keep',null,null,null);
 assert m.verified_at='2026-10-01T00:00:00Z','metadata edits must preserve actual original verification time';old_time:=m.verified_at;
 update public.documents set title='Changed after the displayed snapshot' where id='8c000000-0000-4000-8000-000000000001';
 begin
 perform public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,m.document_id,null,'Unchanged note','verify','document:'||m.document_id::text||':'||doc_rev::text,doc_rev,null);
 raise exception 'stale material verification accepted';
 exception when others then if sqlerrm<>'workflow_material_source_conflict' then raise;end if;end;
 assert (select revision=m.revision and verified_at=old_time and note='Only note changed' from public.career_material_checks where id=m.id),'a rejected source version must not overwrite metadata or timestamps';
 select mutation_revision into doc_rev from public.documents where id=m.document_id;
 m:=public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,m.document_id,null,'Explicit new check','verify','document:'||m.document_id::text||':'||doc_rev::text,doc_rev,null);
 assert m.verified_at<>old_time and m.verified_object_revision='document:'||m.document_id::text||':'||doc_rev::text;
 old_time:=m.verified_at;
 m:=public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,m.document_id,null,'Later metadata change','keep',null,null,null);
 assert m.verified_at=old_time,'keeping metadata never invents a new verification';
 m:=public.save_career_material_check('8e000000-0000-4000-8000-000000000002',m.opportunity_id,0,'Exact resume timestamp',true,null,'8f000000-0000-4000-8000-000000000001','JSON timestamp capture','verify','manual|resume:8f000000-0000-4000-8000-000000000001:2026-10-27T00:00:00.123456+00:00',null,'2026-10-27T00:00:00.123456+00:00');
 assert m.verified_at is not null,'PostgREST ISO timestamp must match typed PostgreSQL value';old_time:=m.verified_at;
 m:=public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,null,m.resume_version_id,'Equivalent SQL timestamp capture','verify','manual|resume:8f000000-0000-4000-8000-000000000001:2026-10-27 00:00:00.123456+00',null,'2026-10-27T08:00:00.123456+08:00');
 begin perform public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,null,m.resume_version_id,'Stale same millisecond','verify','manual|resume:8f000000-0000-4000-8000-000000000001:2026-10-27T00:00:00.123455+00:00',null,'2026-10-27T00:00:00.123455+00:00');raise exception 'microsecond source mismatch accepted';exception when others then if sqlerrm<>'workflow_material_source_conflict' then raise;end if;end;
 assert (select revision=m.revision and note='Equivalent SQL timestamp capture' from public.career_material_checks where id=m.id),'rejected microsecond mismatch must preserve the material';
 old_time:=m.verified_at;m:=public.save_career_material_check(m.id,m.opportunity_id,m.revision,m.label,true,null,m.resume_version_id,'Keep original resume verification','keep',null,null,null);assert m.verified_at=old_time;
 assert not has_table_privilege('authenticated','public.feed_item_versions','INSERT');
 assert not has_table_privilege('service_role','public.feed_item_versions','UPDATE');
end $$;
reset role;
-- Even a privileged maintenance caller cannot silently rewrite source history.
do $$ begin
 begin update public.feed_item_versions set content_text='forged';raise exception 'version update accepted';exception when others then if sqlerrm<>'workflow_immutable_version' then raise;end if;end;
 assert (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('public.task_planning'::regclass,'public.planning_availability'::regclass,'public.project_workflow_versions'::regclass,'public.feed_item_versions'::regclass));
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
do $$ begin
 assert (select count(*)=0 from public.task_planning);
 assert (select count(*)=0 from public.feed_item_versions);
 begin perform public.save_project_workflow('85000000-0000-4000-8000-000000000001',2,'Foreign write','',null);raise exception 'foreign project accepted';exception when others then if sqlerrm<>'workflow_missing' then raise;end if;end;
 begin insert into public.task_planning(user_id,task_id,estimated_minutes) values(auth.uid(),'84000000-0000-4000-8000-000000000001',10);raise exception 'foreign task reference accepted';exception when foreign_key_violation then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.save_planning_availability('2026-10-27','UTC',0,'[]');raise exception 'anonymous callable';exception when insufficient_privilege then null;end;
end $$;
rollback;
