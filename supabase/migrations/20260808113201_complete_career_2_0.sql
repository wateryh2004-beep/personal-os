create table public.application_stage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.career_applications(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('draft','preparing','submitted','interviewing','offer','rejected','withdrawn','closed')),
  event_type text not null default 'stage_changed' check (event_type in ('created','stage_changed','note')),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.gap_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.career_opportunities(id) on delete cascade,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  analysis_type text not null default 'capital' check (analysis_type in ('capital','resume')),
  status text not null default 'completed' check (status in ('completed','archived')),
  summary text not null default '',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.gap_analysis_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.gap_analysis_runs(id) on delete cascade,
  requirement_id uuid not null references public.opportunity_requirements(id) on delete cascade,
  assessment text not null check (assessment in ('strong','partial','missing','unknown')),
  gap_type text not null check (gap_type in ('capital','resume_expression')),
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (run_id, requirement_id, gap_type)
);

create table public.gap_analysis_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gap_item_id uuid not null references public.gap_analysis_items(id) on delete cascade,
  entity_type text not null check (entity_type in ('experience_fact','experience_bullet','skill','certification','experience_output')),
  entity_id uuid not null,
  evidence_role text not null default 'supporting' check (evidence_role in ('supporting','contradicting')),
  created_at timestamptz not null default now(),
  unique (gap_item_id, entity_type, entity_id)
);

create index application_stage_events_owner_application_idx on public.application_stage_events(user_id, application_id, occurred_at desc);
create index gap_analysis_runs_owner_opportunity_idx on public.gap_analysis_runs(user_id, opportunity_id, created_at desc) where archived_at is null;
create index gap_analysis_items_run_idx on public.gap_analysis_items(run_id, assessment);
create index gap_analysis_evidence_item_idx on public.gap_analysis_evidence(gap_item_id);

alter table public.application_stage_events enable row level security;
alter table public.gap_analysis_runs enable row level security;
alter table public.gap_analysis_items enable row level security;
alter table public.gap_analysis_evidence enable row level security;

create policy "application_stage_events_own" on public.application_stage_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "gap_analysis_runs_own" on public.gap_analysis_runs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "gap_analysis_items_own" on public.gap_analysis_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "gap_analysis_evidence_own" on public.gap_analysis_evidence for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger career_opportunities_updated_at before update on public.career_opportunities for each row execute procedure public.set_updated_at();
create trigger opportunity_requirements_updated_at before update on public.opportunity_requirements for each row execute procedure public.set_updated_at();
create trigger resume_versions_updated_at before update on public.resume_versions for each row execute procedure public.set_updated_at();
create trigger career_applications_updated_at before update on public.career_applications for each row execute procedure public.set_updated_at();

create or replace function public.transition_career_application(
  p_application_id uuid,
  p_to_status text,
  p_note text default null
) returns public.career_applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_row public.career_applications;
  previous_status text;
begin
  if p_to_status not in ('draft','preparing','submitted','interviewing','offer','rejected','withdrawn','closed') then
    raise exception 'invalid application status';
  end if;
  select * into current_row from public.career_applications
    where id = p_application_id and user_id = (select auth.uid()) and archived_at is null
    for update;
  if current_row.id is null then raise exception 'application not found'; end if;
  previous_status := current_row.status;
  update public.career_applications
    set status = p_to_status,
        applied_at = case when p_to_status = 'submitted' and applied_at is null then now() else applied_at end
    where id = p_application_id
    returning * into current_row;
  if current_row.status is distinct from p_to_status then raise exception 'application transition failed'; end if;
  insert into public.application_stage_events(user_id, application_id, from_status, to_status, event_type, note)
    values ((select auth.uid()), p_application_id, previous_status,
      p_to_status, 'stage_changed', nullif(trim(p_note), ''));
  return current_row;
end;
$$;

revoke all on function public.transition_career_application(uuid,text,text) from public;
grant execute on function public.transition_career_application(uuid,text,text) to authenticated;

create or replace function public.finalize_resume_version(p_resume_id uuid)
returns public.resume_versions
language plpgsql
security invoker
set search_path = public
as $$
declare result public.resume_versions;
begin
  update public.resume_versions
    set status = 'approved'
    where id = p_resume_id and user_id = (select auth.uid()) and archived_at is null and status = 'draft'
    returning * into result;
  if result.id is null then raise exception 'draft resume not found'; end if;
  return result;
end;
$$;

revoke all on function public.finalize_resume_version(uuid) from public;
grant execute on function public.finalize_resume_version(uuid) to authenticated;

alter table public.entity_links
  drop constraint if exists entity_links_source_type_check,
  drop constraint if exists entity_links_target_type_check;
alter table public.entity_links
  add constraint entity_links_source_type_check check (source_type in (
    'career_direction','career_milestone','career_track','experience','experience_fact','experience_output','experience_bullet',
    'career_opportunity','career_application','resume_version','review','note','document','todo_task','calendar_event','project','task'
  )),
  add constraint entity_links_target_type_check check (target_type in (
    'career_direction','career_milestone','career_track','experience','experience_fact','experience_output','experience_bullet',
    'career_opportunity','career_application','resume_version','review','note','document','todo_task','calendar_event','project','task'
  ));

create or replace function public.sync_career_2_search_document() returns trigger
language plpgsql set search_path = public as $$
declare
  entity_type_value text;
  title_value text;
  subtitle_value text := '';
  content_value text := '';
  metadata_value jsonb;
begin
  metadata_value := jsonb_build_object('source_table',tg_table_name);
  entity_type_value := case tg_table_name
    when 'career_opportunities' then 'career_opportunity'
    when 'career_applications' then 'career_application'
    when 'resume_versions' then 'resume_version'
  end;
  if tg_op = 'DELETE' then
    delete from public.search_documents where user_id = old.user_id and entity_type = entity_type_value and entity_id = old.id;
    return old;
  end if;
  if new.archived_at is not null or (tg_table_name = 'career_opportunities' and new.status = 'archived') then
    delete from public.search_documents where user_id = new.user_id and entity_type = entity_type_value and entity_id = new.id;
    return new;
  end if;
  if tg_table_name = 'career_opportunities' then
    title_value := concat_ws(' · ', new.organization, new.role_title);
    subtitle_value := concat_ws(' · ', new.location, new.status);
    content_value := concat_ws(' ', new.jd_markdown, new.notes_markdown, new.source_name, new.recruitment_cycle);
  elsif tg_table_name = 'resume_versions' then
    title_value := new.title;
    subtitle_value := concat_ws(' · ', new.version_label, new.status);
    content_value := new.content_markdown;
  else
    select concat_ws(' · ', opportunity.organization, opportunity.role_title)
      into title_value from public.career_opportunities opportunity where opportunity.id = new.opportunity_id;
    subtitle_value := new.status;
    content_value := new.notes_markdown;
    metadata_value := metadata_value || jsonb_build_object('opportunity_id',new.opportunity_id);
  end if;
  insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
    values(new.user_id,'career',entity_type_value,new.id,coalesce(title_value,''),coalesce(subtitle_value,''),coalesce(content_value,''),metadata_value,new.updated_at)
  on conflict(user_id,entity_type,entity_id) do update set
    title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,metadata=excluded.metadata,source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end;
$$;

create trigger search_career_opportunities after insert or update or delete on public.career_opportunities for each row execute procedure public.sync_career_2_search_document();
create trigger search_career_applications after insert or update or delete on public.career_applications for each row execute procedure public.sync_career_2_search_document();
create trigger search_resume_versions after insert or update or delete on public.resume_versions for each row execute procedure public.sync_career_2_search_document();

insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','career_opportunity',id,concat_ws(' · ',organization,role_title),concat_ws(' · ',location,status),concat_ws(' ',jd_markdown,notes_markdown,source_name,recruitment_cycle),jsonb_build_object('source_table','career_opportunities'),updated_at
from public.career_opportunities where archived_at is null and status <> 'archived' on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','resume_version',id,title,concat_ws(' · ',version_label,status),content_markdown,jsonb_build_object('source_table','resume_versions'),updated_at
from public.resume_versions where archived_at is null on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select application.user_id,'career','career_application',application.id,concat_ws(' · ',opportunity.organization,opportunity.role_title),application.status,application.notes_markdown,jsonb_build_object('source_table','career_applications','opportunity_id',application.opportunity_id),application.updated_at
from public.career_applications application join public.career_opportunities opportunity on opportunity.id=application.opportunity_id
where application.archived_at is null on conflict(user_id,entity_type,entity_id) do nothing;
