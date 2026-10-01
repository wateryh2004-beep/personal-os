-- Daily priorities are references to Microsoft To Do tasks, never duplicate tasks.
-- Additive and rollback-safe: old application versions ignore this table.
create table public.today_task_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_date date not null,
  task_id uuid not null references public.microsoft_todo_tasks(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, focus_date, task_id)
);
create unique index today_task_priorities_active_position_idx
  on public.today_task_priorities (user_id, focus_date, position) where archived_at is null;
create index today_task_priorities_task_idx on public.today_task_priorities (task_id);
create trigger today_task_priorities_updated_at before update on public.today_task_priorities
  for each row execute function public.set_updated_at();
alter table public.today_task_priorities enable row level security;
revoke all on public.today_task_priorities from anon, authenticated;
grant select, insert, update on public.today_task_priorities to authenticated;
create policy today_task_priorities_select on public.today_task_priorities for select to authenticated
  using ((select auth.uid()) = user_id);
create policy today_task_priorities_insert on public.today_task_priorities for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.microsoft_todo_tasks t where t.id = task_id and t.user_id = (select auth.uid())
  ));
create policy today_task_priorities_update on public.today_task_priorities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.microsoft_todo_tasks t where t.id = task_id and t.user_id = (select auth.uid())
  ));

-- Atomic replacement, with a compare-and-swap guard for concurrent devices.
create function public.set_today_task_priorities(p_date date, p_task_ids uuid[], p_previous_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  owner_timezone text;
  current_ids uuid[];
begin
  if owner_id is null then raise exception 'focus_unauthorized'; end if;
  if p_task_ids is null or p_previous_ids is null or cardinality(p_task_ids) > 3
    or cardinality(p_previous_ids) > 3 or array_position(p_task_ids, null) is not null
    or cardinality(p_task_ids) <> (select count(distinct id) from unnest(p_task_ids) id)
  then raise exception 'focus_invalid'; end if;
  select coalesce(timezone, 'Asia/Shanghai') into owner_timezone from public.profiles where user_id = owner_id;
  if p_date is null or p_date <> (now() at time zone coalesce(owner_timezone, 'Asia/Shanghai'))::date
  then raise exception 'focus_date_changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || p_date::text, 0));
  select coalesce(array_agg(task_id order by position), '{}'::uuid[]) into current_ids
    from public.today_task_priorities where user_id = owner_id and focus_date = p_date and archived_at is null;
  if current_ids is distinct from p_previous_ids then raise exception 'focus_conflict'; end if;
  if exists (select 1 from unnest(p_task_ids) requested(id) where not exists (
    select 1 from public.microsoft_todo_tasks t where t.id = requested.id and t.user_id = owner_id and t.archived_at is null
  )) then raise exception 'focus_task_unavailable'; end if;
  update public.today_task_priorities set archived_at = now()
    where user_id = owner_id and focus_date = p_date and archived_at is null;
  insert into public.today_task_priorities (user_id, focus_date, task_id, position)
    select owner_id, p_date, id, ordinal::smallint from unnest(p_task_ids) with ordinality requested(id, ordinal)
    on conflict (user_id, focus_date, task_id) do update
      set position = excluded.position, archived_at = null;
  insert into public.audit_logs (user_id, action, entity_type, actor_type, before_data, after_data)
    values (owner_id, 'set_priorities', 'today', 'user', jsonb_build_object('date', p_date, 'task_ids', current_ids), jsonb_build_object('date', p_date, 'task_ids', p_task_ids));
end;
$$;
revoke all on function public.set_today_task_priorities(date, uuid[], uuid[]) from public, anon;
grant execute on function public.set_today_task_priorities(date, uuid[], uuid[]) to authenticated;
