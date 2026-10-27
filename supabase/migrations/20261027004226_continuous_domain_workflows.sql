-- Additive workflow metadata. Microsoft remains the execution authority.
create schema if not exists workflow_private;
revoke all on schema workflow_private from public,anon,authenticated;
create unique index continuous_todo_owner on public.microsoft_todo_tasks(user_id,id);
create unique index continuous_project_owner on public.projects(user_id,id);
create unique index continuous_opportunity_owner on public.career_opportunities(user_id,id);
create unique index continuous_resume_owner on public.resume_versions(user_id,id);
-- Existing documents_life_id_owner_unique(id,user_id) supplies this owner FK.
create unique index continuous_purchase_owner on public.purchase_items(user_id,id);
create unique index continuous_feed_owner on public.feed_items(user_id,id);

create table public.task_planning (
 user_id uuid not null references auth.users(id), task_id uuid not null,
 planned_on date, estimated_minutes integer check(estimated_minutes between 1 and 10080),
 created_at timestamptz not null default now(), archived_at timestamptz, revision bigint not null default 1, updated_at timestamptz not null default now(),
 primary key(user_id,task_id), foreign key(user_id,task_id) references public.microsoft_todo_tasks(user_id,id)
);
create table public.planning_availability (
 user_id uuid not null references auth.users(id), local_date date not null, timezone text not null,
 periods jsonb not null default '[]' check(jsonb_typeof(periods)='array' and jsonb_array_length(periods)<=12),
 created_at timestamptz not null default now(), archived_at timestamptz, revision bigint not null default 1, updated_at timestamptz not null default now(), primary key(user_id,local_date)
);
alter table public.projects add column blocker_text text not null default '' check(length(blocker_text)<=8000),
 add column next_todo_task_id uuid, add column mutation_revision bigint not null default 1;
alter table public.projects add constraint project_next_todo_owner foreign key(user_id,next_todo_task_id) references public.microsoft_todo_tasks(user_id,id);
create index project_next_todo_idx on public.projects(user_id,next_todo_task_id);
create table public.project_workflow_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), project_id uuid not null,
 description text, blocker_text text not null, next_todo_task_id uuid, revision bigint not null,
 created_at timestamptz not null default now(), foreign key(user_id,project_id) references public.projects(user_id,id),
 unique(user_id,project_id,revision)
);
create table public.career_material_checks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), opportunity_id uuid not null,
 label text not null check(length(label) between 1 and 240), required boolean not null default true,
 document_id uuid, resume_version_id uuid, verified_at timestamptz, verified_object_revision text,
 note text not null default '' check(length(note)<=4000), revision bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 foreign key(user_id,opportunity_id) references public.career_opportunities(user_id,id),
 foreign key(user_id,document_id) references public.documents(user_id,id),
 foreign key(user_id,resume_version_id) references public.resume_versions(user_id,id)
);
create index career_material_opportunity on public.career_material_checks(user_id,opportunity_id);
create index career_material_document on public.career_material_checks(user_id,document_id);
create index career_material_resume on public.career_material_checks(user_id,resume_version_id);
alter table public.purchase_items add column purchased_on date, add column return_until date, add column warranty_until date,
 add column order_reference text not null default '' check(length(order_reference)<=500),
 add column aftercare_note text not null default '' check(length(aftercare_note)<=8000),
 add constraint purchase_aftercare_dates check((return_until is null or purchased_on is null or return_until>=purchased_on) and (warranty_until is null or purchased_on is null or warranty_until>=purchased_on));
create table public.purchase_item_documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), item_id uuid not null, document_id uuid not null,
 kind text not null check(kind in ('receipt','invoice','warranty','other')), label text not null default '' check(length(label)<=240),
 revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),archived_at timestamptz,
 foreign key(user_id,item_id) references public.purchase_items(user_id,id),foreign key(user_id,document_id) references public.documents(user_id,id),
 unique(user_id,item_id,document_id)
);
create index purchase_documents_document on public.purchase_item_documents(user_id,document_id);
create table public.briefing_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),title text not null check(length(title) between 1 and 240),
 revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,unique(user_id,id)
);
create table public.briefing_event_sources (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),event_id uuid not null,feed_item_id uuid not null,
 revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,
 foreign key(user_id,event_id) references public.briefing_events(user_id,id),foreign key(user_id,feed_item_id) references public.feed_items(user_id,id),unique(user_id,event_id,feed_item_id)
);
create index briefing_event_source_item on public.briefing_event_sources(user_id,feed_item_id);
create table public.feed_item_versions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),feed_item_id uuid not null,
 title text not null,content_text text,excerpt text,url text,content_hash text,published_at timestamptz,updated_at_source timestamptz,
 observed_at timestamptz not null default clock_timestamp(),provenance text not null check(provenance in ('baseline','observed')),
 foreign key(user_id,feed_item_id) references public.feed_items(user_id,id)
);
create index feed_versions_item_time on public.feed_item_versions(user_id,feed_item_id,observed_at,id);

-- Fixed trigger functions are inaccessible through Data API. Their only elevated
-- operation is appending a snapshot/audit derived from an already RLS-checked row.
create function workflow_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,before_data,after_data)
 values(new.user_id,'workflow_save',tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'task_id',to_jsonb(new)->>'user_id')::uuid,'user',case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create function workflow_private.bump_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1;new.updated_at:=now();return new;end $$;
create function workflow_private.project_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.project_workflow_versions(user_id,project_id,description,blocker_text,next_todo_task_id,revision) values(new.user_id,new.id,new.description,new.blocker_text,new.next_todo_task_id,new.mutation_revision);
 else
  new.mutation_revision:=old.mutation_revision+1;
  insert into public.project_workflow_versions(user_id,project_id,description,blocker_text,next_todo_task_id,revision) values(old.user_id,old.id,old.description,old.blocker_text,old.next_todo_task_id,old.mutation_revision) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger projects_workflow_version before update on public.projects for each row execute function workflow_private.project_version();
create trigger projects_workflow_initial after insert on public.projects for each row execute function workflow_private.project_version();
create function workflow_private.feed_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.title,new.content_text,new.excerpt,new.url,new.content_hash,new.published_at,new.updated_at_source) is not distinct from (old.title,old.content_text,old.excerpt,old.url,old.content_hash,old.published_at,old.updated_at_source) then return new;end if;
 if tg_op='UPDATE' and not exists(select 1 from public.feed_item_versions where user_id=old.user_id and feed_item_id=old.id) then
  insert into public.feed_item_versions(user_id,feed_item_id,title,content_text,excerpt,url,content_hash,published_at,updated_at_source,provenance)
  values(old.user_id,old.id,old.title,old.content_text,old.excerpt,old.url,old.content_hash,old.published_at,old.updated_at_source,'baseline');
 end if;
 insert into public.feed_item_versions(user_id,feed_item_id,title,content_text,excerpt,url,content_hash,published_at,updated_at_source,provenance)
 values(new.user_id,new.id,new.title,new.content_text,new.excerpt,new.url,new.content_hash,new.published_at,new.updated_at_source,'observed');
 return new;
end $$;
create trigger feed_items_immutable_snapshots after insert or update on public.feed_items for each row execute function workflow_private.feed_version();
-- Existing rows get a truthful baseline observed now, not invented history.
insert into public.feed_item_versions(user_id,feed_item_id,title,content_text,excerpt,url,content_hash,published_at,updated_at_source,provenance)
select user_id,id,title,content_text,excerpt,url,content_hash,published_at,updated_at_source,'baseline' from public.feed_items;
revoke all on all functions in schema workflow_private from public,anon,authenticated;

do $$ declare t text;begin
 foreach t in array array['task_planning','planning_availability','career_material_checks','purchase_item_documents','briefing_events','briefing_event_sources'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create policy workflow_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create policy workflow_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 execute format('create policy workflow_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('grant select,insert,update on public.%I to service_role',t);
 execute format('create trigger workflow_revision before update on public.%I for each row execute function workflow_private.bump_revision()',t);
 execute format('create trigger workflow_audit after insert or update on public.%I for each row execute function workflow_private.audit_change()',t);
 end loop;
 foreach t in array array['project_workflow_versions','feed_item_versions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create policy workflow_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 end loop;
end $$;

create function public.save_task_planning(p_task_id uuid,p_expected_revision bigint,p_minutes integer,p_planned_on date default null) returns public.task_planning language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();r public.task_planning;begin
 if owner_id is null or (p_expected_revision is null or p_expected_revision<0) or (p_minutes is not null and p_minutes not between 1 and 10080) then raise exception 'workflow_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_task_id::text,0));
 perform 1 from public.microsoft_todo_tasks where id=p_task_id and user_id=owner_id and archived_at is null;if not found then raise exception 'workflow_missing';end if;
 select * into r from public.task_planning where task_id=p_task_id and user_id=owner_id for update;
 if found then if r.revision<>p_expected_revision then raise exception 'workflow_conflict';end if;update public.task_planning set estimated_minutes=p_minutes,planned_on=p_planned_on where user_id=owner_id and task_id=p_task_id returning * into r;
 else if p_expected_revision<>0 then raise exception 'workflow_conflict';end if;insert into public.task_planning(user_id,task_id,estimated_minutes,planned_on) values(owner_id,p_task_id,p_minutes,p_planned_on) returning * into r;end if;return r;end $$;
create function public.save_planning_availability(p_date date,p_timezone text,p_expected_revision bigint,p_periods jsonb) returns public.planning_availability language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();r public.planning_availability;part jsonb;previous_end integer:=-1;start_min integer;end_min integer;begin
 if owner_id is null or p_date is null or (p_expected_revision is null or p_expected_revision<0) or not exists(select 1 from pg_timezone_names where name=p_timezone) or jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)>12 then raise exception 'workflow_invalid';end if;
 for part in select value from jsonb_array_elements(p_periods) loop
 if jsonb_typeof(part)<>'object' or exists(select 1 from jsonb_object_keys(part) k where k not in ('start','end')) or not (part ? 'start' and part ? 'end') or (part->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (part->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'workflow_invalid';end if;
 start_min:=split_part(part->>'start',':',1)::integer*60+split_part(part->>'start',':',2)::integer;end_min:=split_part(part->>'end',':',1)::integer*60+split_part(part->>'end',':',2)::integer;
 if start_min<previous_end or end_min<=start_min then raise exception 'workflow_invalid';end if;previous_end:=end_min;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_date::text,0));select * into r from public.planning_availability where user_id=owner_id and local_date=p_date for update;
 if found then if r.revision<>p_expected_revision then raise exception 'workflow_conflict';end if;update public.planning_availability set timezone=p_timezone,periods=p_periods where user_id=owner_id and local_date=p_date returning * into r;
 else if p_expected_revision<>0 then raise exception 'workflow_conflict';end if;insert into public.planning_availability(user_id,local_date,timezone,periods) values(owner_id,p_date,p_timezone,p_periods) returning * into r;end if;return r;end $$;
create function public.save_project_workflow(p_project_id uuid,p_expected_revision bigint,p_goal text,p_blocker text,p_next_task uuid) returns public.projects language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();r public.projects;begin
 if owner_id is null or p_expected_revision is null or length(coalesce(p_goal,''))>8000 or length(coalesce(p_blocker,''))>8000 then raise exception 'workflow_invalid';end if;
 select * into r from public.projects where id=p_project_id and user_id=owner_id and archived_at is null for update;if not found then raise exception 'workflow_missing';end if;if r.mutation_revision<>p_expected_revision then raise exception 'workflow_conflict';end if;
 if p_next_task is not null and p_next_task is distinct from r.next_todo_task_id and not exists(select 1 from public.microsoft_todo_tasks where id=p_next_task and user_id=owner_id and archived_at is null and status<>'completed') then raise exception 'workflow_task_missing';end if;
 update public.projects set description=nullif(p_goal,''),blocker_text=coalesce(p_blocker,''),next_todo_task_id=p_next_task,updated_at=now() where id=p_project_id and user_id=owner_id returning * into r;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,'workflow_save','project',r.id,'user',jsonb_build_object('revision',r.mutation_revision));return r;end $$;
revoke all on function public.save_task_planning(uuid,bigint,integer,date),public.save_planning_availability(date,text,bigint,jsonb),public.save_project_workflow(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.save_task_planning(uuid,bigint,integer,date),public.save_planning_availability(date,text,bigint,jsonb),public.save_project_workflow(uuid,bigint,text,text,uuid) to authenticated;

create function public.save_purchase_aftercare(p_item_id uuid,p_expected_revision bigint,p_purchased_on date,p_return_until date,p_warranty_until date,p_order_reference text,p_note text,p_document_id uuid default null,p_document_kind text default 'receipt') returns public.purchase_items language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();r public.purchase_items;begin
 if owner_id is null or p_expected_revision is null or length(coalesce(p_order_reference,''))>500 or length(coalesce(p_note,''))>8000 or p_document_kind not in ('receipt','invoice','warranty','other') then raise exception 'workflow_invalid';end if;
 select * into r from public.purchase_items where id=p_item_id and user_id=owner_id and archived_at is null and status='purchased' for update;if not found then raise exception 'workflow_missing';end if;if r.mutation_revision<>p_expected_revision then raise exception 'workflow_conflict';end if;
 if p_document_id is not null and not exists(select 1 from public.documents where id=p_document_id and user_id=owner_id and vault_group_id is null and archived_at is null and storage_state='available') then raise exception 'workflow_document_missing';end if;
 update public.purchase_items set purchased_on=p_purchased_on,return_until=p_return_until,warranty_until=p_warranty_until,order_reference=coalesce(p_order_reference,''),aftercare_note=coalesce(p_note,'') where id=p_item_id and user_id=owner_id returning * into r;
 if p_document_id is not null then insert into public.purchase_item_documents(user_id,item_id,document_id,kind) values(owner_id,p_item_id,p_document_id,p_document_kind) on conflict(user_id,item_id,document_id) do update set kind=excluded.kind,archived_at=null;end if;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,'aftercare_save','purchase_item',r.id,'user',jsonb_build_object('revision',r.mutation_revision));return r;
end $$;
revoke all on function public.save_purchase_aftercare(uuid,bigint,date,date,date,text,text,uuid,text) from public,anon;
grant execute on function public.save_purchase_aftercare(uuid,bigint,date,date,date,text,text,uuid,text) to authenticated;

create function public.save_briefing_event_source(p_event_id uuid,p_expected_revision bigint,p_title text,p_item_id uuid,p_linked boolean) returns public.briefing_events language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();r public.briefing_events;begin
 if owner_id is null or p_expected_revision is null or p_expected_revision<0 or p_event_id is null or p_linked is null or p_title is null or length(btrim(p_title)) not between 1 and 240 then raise exception 'workflow_invalid';end if;
 if not exists(select 1 from public.feed_items where id=p_item_id and user_id=owner_id and archived_at is null) then raise exception 'workflow_source_missing';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_event_id::text,0));select * into r from public.briefing_events where id=p_event_id and user_id=owner_id and archived_at is null for update;
 if found then if r.revision<>p_expected_revision then raise exception 'workflow_conflict';end if;update public.briefing_events set title=btrim(p_title) where id=p_event_id and user_id=owner_id returning * into r;
 else if p_expected_revision<>0 or not p_linked then raise exception 'workflow_conflict';end if;insert into public.briefing_events(id,user_id,title) values(p_event_id,owner_id,btrim(p_title)) returning * into r;end if;
 if p_linked then insert into public.briefing_event_sources(user_id,event_id,feed_item_id) values(owner_id,r.id,p_item_id) on conflict(user_id,event_id,feed_item_id) do update set archived_at=null;
 else update public.briefing_event_sources set archived_at=now() where user_id=owner_id and event_id=r.id and feed_item_id=p_item_id;end if;return r;end $$;
revoke all on function public.save_briefing_event_source(uuid,bigint,text,uuid,boolean) from public,anon;
grant execute on function public.save_briefing_event_source(uuid,bigint,text,uuid,boolean) to authenticated;

-- Append-only is enforced for every role, including privileged maintenance clients.
create function workflow_private.reject_version_rewrite() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'workflow_immutable_version';end $$;
revoke all on function workflow_private.reject_version_rewrite() from public,anon,authenticated;
create trigger project_versions_append_only before update or delete on public.project_workflow_versions for each row execute function workflow_private.reject_version_rewrite();
create trigger feed_versions_append_only before update or delete on public.feed_item_versions for each row execute function workflow_private.reject_version_rewrite();
create function workflow_private.validate_availability() returns trigger language plpgsql set search_path='' as $$
declare part jsonb;previous_end integer:=-1;start_min integer;end_min integer;begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) or jsonb_typeof(new.periods)<>'array' or jsonb_array_length(new.periods)>12 then raise exception 'workflow_invalid';end if;
 for part in select value from jsonb_array_elements(new.periods) loop
 if jsonb_typeof(part)<>'object' or exists(select 1 from jsonb_object_keys(part) k where k not in ('start','end')) or not (part ? 'start' and part ? 'end') or jsonb_typeof(part->'start')<>'string' or jsonb_typeof(part->'end')<>'string' or (part->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (part->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'workflow_invalid';end if;
 start_min:=split_part(part->>'start',':',1)::integer*60+split_part(part->>'start',':',2)::integer;end_min:=split_part(part->>'end',':',1)::integer*60+split_part(part->>'end',':',2)::integer;
 if start_min<previous_end or end_min<=start_min then raise exception 'workflow_invalid';end if;previous_end:=end_min;
 end loop;return new;end $$;
revoke all on function workflow_private.validate_availability() from public,anon,authenticated;
create trigger availability_typed_input before insert or update on public.planning_availability for each row execute function workflow_private.validate_availability();

-- New references inherit the same Vault boundary as existing cross-domain links.
create policy vault_references on public.career_material_checks as restrictive for all to authenticated using(vault_private.row_visible(to_jsonb(career_material_checks.*))) with check(vault_private.row_visible(to_jsonb(career_material_checks.*)));
create policy vault_references on public.purchase_item_documents as restrictive for all to authenticated using(vault_private.row_visible(to_jsonb(purchase_item_documents.*))) with check(vault_private.row_visible(to_jsonb(purchase_item_documents.*)));

-- Verification intent is distinct from metadata edits. Source rows are held
-- against concurrent updates until the material CAS/audit transaction commits.
create function public.save_career_material_check(p_id uuid,p_opportunity_id uuid,p_expected_revision bigint,p_label text,p_required boolean,p_document_id uuid,p_resume_id uuid,p_note text,p_verification_intent text,p_expected_object_revision text,p_expected_document_revision bigint,p_expected_resume_updated_at timestamptz)
returns public.career_material_checks language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();prior public.career_material_checks;result public.career_material_checks;d public.documents;resume public.resume_versions;verified_time timestamptz;verified_object text;object_prefix text;object_resume_time timestamptz;begin
 if owner_id is null or p_id is null or p_expected_revision is null or p_expected_revision<0 or p_label is null or length(btrim(p_label)) not between 1 and 240 or p_required is null or length(coalesce(p_note,''))>4000 or p_verification_intent is null or p_verification_intent not in ('keep','clear','verify') then raise exception 'workflow_invalid';end if;
 perform 1 from public.career_opportunities where id=p_opportunity_id and user_id=owner_id and archived_at is null for share;if not found then raise exception 'workflow_missing';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_id::text,0));
 select * into prior from public.career_material_checks where id=p_id and user_id=owner_id and opportunity_id=p_opportunity_id and archived_at is null for update;
 if found then if prior.revision<>p_expected_revision then raise exception 'workflow_conflict';end if;elsif p_expected_revision<>0 then raise exception 'workflow_missing';end if;
 if p_document_id is not null and (p_verification_intent='verify' or prior.document_id is distinct from p_document_id) then
  select * into d from public.documents where id=p_document_id and user_id=owner_id and vault_group_id is null and archived_at is null and storage_state='available' for share;
  if not found then raise exception 'workflow_document_missing';end if;
 end if;
 if p_resume_id is not null and (p_verification_intent='verify' or prior.resume_version_id is distinct from p_resume_id) then
  select * into resume from public.resume_versions where id=p_resume_id and user_id=owner_id and archived_at is null for share;
  if not found then raise exception 'workflow_resume_missing';end if;
 end if;
 if p_verification_intent='verify' then
  if p_expected_object_revision is null or length(p_expected_object_revision) not between 1 and 2000 or (p_document_id is not null and (p_expected_document_revision is null or d.mutation_revision<>p_expected_document_revision)) or (p_document_id is null and p_expected_document_revision is not null) or (p_resume_id is not null and (resume.status<>'approved' or p_expected_resume_updated_at is null or resume.updated_at is distinct from p_expected_resume_updated_at)) or (p_resume_id is null and p_expected_resume_updated_at is not null) then raise exception 'workflow_material_source_conflict';end if;
  object_prefix:=case when p_document_id is null then 'manual' else 'document:'||p_document_id::text||':'||d.mutation_revision::text end;
  if p_resume_id is null then
   if p_expected_object_revision<>object_prefix then raise exception 'workflow_material_source_conflict';end if;
  else
   object_prefix:=object_prefix||'|resume:'||p_resume_id::text||':';
   if left(p_expected_object_revision,length(object_prefix))<>object_prefix then raise exception 'workflow_material_source_conflict';end if;
   begin object_resume_time:=substring(p_expected_object_revision from length(object_prefix)+1)::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'workflow_material_source_conflict';end;
   if object_resume_time is distinct from resume.updated_at then raise exception 'workflow_material_source_conflict';end if;
  end if;
  verified_time:=now();verified_object:=p_expected_object_revision;
 elsif p_verification_intent='keep' and prior.id is not null and prior.document_id is not distinct from p_document_id and prior.resume_version_id is not distinct from p_resume_id then
  verified_time:=prior.verified_at;verified_object:=prior.verified_object_revision;
 end if;
 if prior.id is null then
  insert into public.career_material_checks(id,user_id,opportunity_id,label,required,document_id,resume_version_id,note,verified_at,verified_object_revision) values(p_id,owner_id,p_opportunity_id,btrim(p_label),p_required,p_document_id,p_resume_id,coalesce(p_note,''),verified_time,verified_object) returning * into result;
 else
  update public.career_material_checks set label=btrim(p_label),required=p_required,document_id=p_document_id,resume_version_id=p_resume_id,note=coalesce(p_note,''),verified_at=verified_time,verified_object_revision=verified_object where id=prior.id and user_id=owner_id returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.save_career_material_check(uuid,uuid,bigint,text,boolean,uuid,uuid,text,text,text,bigint,timestamptz) from public,anon;
grant execute on function public.save_career_material_check(uuid,uuid,bigint,text,boolean,uuid,uuid,text,text,text,bigint,timestamptz) to authenticated;
