-- Personal Graph V1 extends the existing relationship layer without migrating
-- historical links. `task` remains readable for compatibility; new links use
-- `todo_task` and point at microsoft_todo_tasks.
alter table public.entity_links
  drop constraint if exists entity_links_source_type_check,
  drop constraint if exists entity_links_target_type_check;

alter table public.entity_links
  add constraint entity_links_source_type_check check (source_type in (
    'career_direction', 'career_milestone', 'career_track', 'experience',
    'experience_fact', 'experience_output', 'experience_bullet', 'note',
    'document', 'todo_task', 'calendar_event', 'project', 'task'
  )),
  add constraint entity_links_target_type_check check (target_type in (
    'career_direction', 'career_milestone', 'career_track', 'experience',
    'experience_fact', 'experience_output', 'experience_bullet', 'note',
    'document', 'todo_task', 'calendar_event', 'project', 'task'
  ));

alter table public.entity_links
  add column if not exists created_via text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.entity_links
set created_via = case when relationship_type = 'evidence' then 'system' else 'manual' end
where created_via is null;

alter table public.entity_links
  alter column created_via set default 'manual',
  alter column created_via set not null,
  add constraint entity_links_created_via_check check (created_via in ('manual', 'suggestion', 'system'));

create table public.entity_link_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, target_type, target_id)
);

create index entity_link_dismissals_source_idx
  on public.entity_link_dismissals (user_id, source_type, source_id);

alter table public.entity_link_dismissals enable row level security;
create policy "entity_link_dismissals_select_own" on public.entity_link_dismissals for select to authenticated using ((select auth.uid()) = user_id);
create policy "entity_link_dismissals_insert_own" on public.entity_link_dismissals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "entity_link_dismissals_delete_own" on public.entity_link_dismissals for delete to authenticated using ((select auth.uid()) = user_id);
