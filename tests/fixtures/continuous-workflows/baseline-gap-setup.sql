-- Disposable PostgreSQL only: concatenate in one transaction before the actual forward migration.
-- Prerequisite: actual full schema and checked-in continuous upgrade seed (owners A/B).
-- This models the metadata-proven missing runtime objects, not a production schema clone.
reset role;
drop function public.complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb);
drop function public.accept_review_proposal(uuid);
drop function public.dismiss_review_proposal(uuid);
drop function public.review_source_is_owned(text,uuid,uuid);
drop trigger projects_search_sync on public.projects;
drop function public.sync_project_search_document();
-- Only synthetic derived projection rows are removed to match prod's zero project rows.
delete from public.search_documents where entity_type='project';
insert into public.projects(id,user_id,name,description,status)
 values('e1100000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','Compat foreign project','Foreign canonical goal','active'),
       ('e1100000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','Compat archived project','Retained original goal','active');
update public.projects set archived_at=now() where id='e1100000-0000-4000-8000-000000000003';
-- Synthetic stale derived row verifies cleanup, while the authoritative archived project stays.
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,content_text,source_updated_at)
 values('81000000-0000-4000-8000-000000000001','projects','project','e1100000-0000-4000-8000-000000000003','Stale synthetic projection','Stale',now());
create temp table compat_gap_preservation as
 select 'projects'::text kind,md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) fingerprint from public.projects p
 union all select 'project_versions',md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) from public.project_workflow_versions v
 union all select 'other_search',md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.search_documents s where s.entity_type<>'project';
do $$begin
 assert to_regprocedure('public.complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)') is null;
 assert to_regprocedure('public.accept_review_proposal(uuid)') is null;
 assert to_regprocedure('public.dismiss_review_proposal(uuid)') is null;
 assert to_regprocedure('public.review_source_is_owned(text,uuid,uuid)') is null;
 assert not exists(select 1 from public.search_documents s join public.projects p on (p.user_id,p.id)=(s.user_id,s.entity_id) where s.entity_type='project' and p.archived_at is null);
end $$;
