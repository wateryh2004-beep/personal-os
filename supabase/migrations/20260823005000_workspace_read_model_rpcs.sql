-- Collapse private workspace cold-start reads into one PostgREST round-trip per
-- workspace. These functions remain SECURITY INVOKER so existing RLS stays the
-- authorization boundary; explicit owner predicates also keep the read models
-- self-scoped and make their intent obvious.

create or replace function public.get_tasks_workspace_read_model()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owner as (
    select auth.uid() as user_id
  )
  select jsonb_build_object(
    'connection', coalesce((
      select to_jsonb(connection_row)
      from (
        select
          connection.id,
          connection.status,
          connection.oauth_connected_at,
          connection.last_error_code
        from public.calendar_connections as connection, owner
        where connection.user_id = owner.user_id
          and connection.archived_at is null
        limit 1
      ) as connection_row
    ), 'null'::jsonb),
    'lists', coalesce((
      select jsonb_agg(to_jsonb(list_row) order by list_row.display_name)
      from (
        select
          list.id,
          list.display_name,
          list.is_default
        from public.microsoft_todo_lists as list, owner
        where list.user_id = owner.user_id
          and list.archived_at is null
      ) as list_row
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        to_jsonb(task_row)
        order by task_row.status, task_row.due_at nulls last
      )
      from (
        select
          task.id,
          task.provider_task_id,
          task.title,
          task.body_text,
          task.status,
          task.due_at,
          task.completed_at,
          task.todo_list_id,
          task.importance,
          task.provider_last_modified_at
        from public.microsoft_todo_tasks as task, owner
        where task.user_id = owner.user_id
          and task.archived_at is null
      ) as task_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_tasks_workspace_read_model()
from public, anon;
grant execute on function public.get_tasks_workspace_read_model()
to authenticated;

comment on function public.get_tasks_workspace_read_model() is
  'Owner-scoped Tasks cold-start read model; combines connection, lists, and tasks into one RPC.';

create or replace function public.get_calendar_workspace_read_model()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owner as (
    select auth.uid() as user_id
  )
  select jsonb_build_object(
    'connection', coalesce((
      select to_jsonb(connection_row)
      from (
        select
          connection.id,
          connection.label,
          connection.status,
          connection.last_sync_at,
          connection.last_error_code,
          connection.oauth_connected_at,
          connection.granted_scopes,
          connection.oauth_scope_version,
          connection.calendar_last_delta_sync_at,
          connection.calendar_last_full_reconcile_at,
          connection.calendar_subscription_expires_at,
          connection.calendar_webhook_last_received_at
        from public.calendar_connections as connection, owner
        where connection.user_id = owner.user_id
          and connection.archived_at is null
        limit 1
      ) as connection_row
    ), 'null'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        to_jsonb(category_row)
        order by category_row.display_order, category_row.display_name
      )
      from (
        select
          category.id,
          category.provider_category_id,
          category.display_name,
          category.color,
          category.managed_key,
          category.category_kind,
          category.ai_description,
          category.keywords,
          category.display_order,
          category.is_ai_managed,
          category.ai_enabled,
          category.last_synced_at
        from public.calendar_categories as category, owner
        where category.user_id = owner.user_id
          and category.archived_at is null
      ) as category_row
    ), '[]'::jsonb),
    'timezone', coalesce((
      select profile.timezone
      from public.profiles as profile, owner
      where profile.user_id = owner.user_id
        and profile.archived_at is null
      limit 1
    ), 'Asia/Shanghai'),
    'running_sync', coalesce((
      select to_jsonb(sync_row)
      from (
        select sync_run.id, sync_run.started_at
        from public.calendar_sync_runs as sync_run, owner
        where sync_run.user_id = owner.user_id
          and sync_run.status = 'running'
          and sync_run.archived_at is null
        order by sync_run.started_at desc
        limit 1
      ) as sync_row
    ), 'null'::jsonb)
  );
$$;

revoke all on function public.get_calendar_workspace_read_model()
from public, anon;
grant execute on function public.get_calendar_workspace_read_model()
to authenticated;

comment on function public.get_calendar_workspace_read_model() is
  'Owner-scoped Calendar cold-start read model; combines connection, categories, timezone, and active sync into one RPC.';

create or replace function public.get_today_workspace_read_model(
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owner as (
    select auth.uid() as user_id
  ),
  identity as (
    select
      owner.user_id,
      coalesce((
        select profile.timezone
        from public.profiles as profile
        where profile.user_id = owner.user_id
          and profile.archived_at is null
        limit 1
      ), 'Asia/Shanghai') as timezone
    from owner
  ),
  bounds as (
    select
      identity.user_id,
      identity.timezone,
      timezone(identity.timezone, p_now)::date as today,
      timezone(identity.timezone, p_now)::date + 30 as future30,
      p_now - interval '48 hours' as from_at,
      p_now + interval '9 days' as until_at,
      'weekly:' || date_trunc(
        'week',
        timezone(identity.timezone, p_now)
      )::date::text as weekly_key
    from identity
  ),
  recent_briefings as (
    select
      briefing.id,
      briefing.briefing_date,
      briefing.generated_at
    from public.briefings as briefing, bounds
    where briefing.user_id = bounds.user_id
      and briefing.status = 'completed'
    order by briefing.generated_at desc nulls last
    limit 20
  ),
  displayed_briefing as (
    select
      recent.id,
      recent.briefing_date
    from recent_briefings as recent, bounds
    order by
      (recent.briefing_date = bounds.today) desc,
      recent.generated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'timezone', (select bounds.timezone from bounds),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.due_at nulls last)
      from (
        select
          task.id,
          task.title,
          task.due_at,
          task.importance,
          task.status
        from public.microsoft_todo_tasks as task, bounds
        where task.user_id = bounds.user_id
          and task.archived_at is null
        order by task.due_at asc nulls last
        limit 80
      ) as task_row
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(event_row) order by event_row.starts_at)
      from (
        select
          event.id,
          event.subject,
          event.starts_at,
          event.ends_at,
          event.is_all_day,
          event.location_name
        from public.calendar_events as event, bounds
        where event.user_id = bounds.user_id
          and event.archived_at is null
          and event.starts_at < bounds.until_at
          and event.ends_at > bounds.from_at
        order by event.starts_at
        limit 60
      ) as event_row
    ), '[]'::jsonb),
    'connection', coalesce((
      select to_jsonb(connection_row)
      from (
        select
          connection.status,
          connection.last_sync_at,
          connection.last_error_code
        from public.calendar_connections as connection, bounds
        where connection.user_id = bounds.user_id
          and connection.archived_at is null
        limit 1
      ) as connection_row
    ), 'null'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(to_jsonb(milestone_row) order by milestone_row.target_date)
      from (
        select
          milestone.id,
          milestone.track_id,
          milestone.career_direction_id,
          milestone.title,
          milestone.starts_on,
          milestone.target_date,
          milestone.status,
          milestone.importance
        from public.career_milestones as milestone, bounds
        where milestone.user_id = bounds.user_id
          and milestone.archived_at is null
          and milestone.status in ('planned', 'in_progress')
          and milestone.target_date >= bounds.today
          and milestone.target_date <= bounds.future30
        order by milestone.target_date
        limit 20
      ) as milestone_row
    ), '[]'::jsonb),
    'inbox_count', (
      select count(*)
      from public.inbox_items as inbox, bounds
      where inbox.user_id = bounds.user_id
        and inbox.archived_at is null
    ),
    'weekly_review_completed', exists(
      select 1
      from public.reviews as review, bounds
      where review.user_id = bounds.user_id
        and review.review_key = bounds.weekly_key
        and review.status = 'completed'
        and review.archived_at is null
    ),
    'due_decisions', coalesce((
      select jsonb_agg(to_jsonb(decision_row) order by decision_row.review_at)
      from (
        select decision.id, decision.title, decision.review_at
        from public.decisions as decision, bounds
        where decision.user_id = bounds.user_id
          and decision.status = 'active'
          and decision.archived_at is null
          and decision.review_at is not null
          and decision.review_at <= p_now
        order by decision.review_at
        limit 2
      ) as decision_row
    ), '[]'::jsonb),
    'briefing_date', (
      select displayed.briefing_date
      from displayed_briefing as displayed
    ),
    'briefing_entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entry_row.id,
          'title', entry_row.title,
          'url', entry_row.url,
          'section', entry_row.section,
          'reason', entry_row.reason
        )
        order by entry_row.position
      )
      from (
        select
          entry.id,
          item.title,
          coalesce(item.canonical_url, item.url) as url,
          entry.section,
          entry.relevance_reason as reason,
          entry.position
        from public.briefing_entries as entry
        join displayed_briefing as displayed
          on displayed.id = entry.briefing_id
        join public.feed_items as item
          on item.id = entry.representative_item_id
        join bounds
          on entry.user_id = bounds.user_id
         and item.user_id = bounds.user_id
        where entry.section in ('must_know', 'worth_reading')
        order by entry.position
        limit 2
      ) as entry_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_today_workspace_read_model(timestamptz)
from public, anon;
grant execute on function public.get_today_workspace_read_model(timestamptz)
to authenticated;

comment on function public.get_today_workspace_read_model(timestamptz) is
  'Owner-scoped Today cold-start read model; combines persisted source reads into one RPC while keeping ranking and presentation logic in application code.';

-- This high-frequency Today count had drifted back to direct auth.uid() calls.
-- Restore InitPlan-style ownership checks while this migration touches the read
-- path; authorization semantics remain unchanged.
alter policy "inbox_select_own" on public.inbox_items
  using (user_id = (select auth.uid()));
alter policy "inbox_insert_own" on public.inbox_items
  with check (user_id = (select auth.uid()));
alter policy "inbox_update_own" on public.inbox_items
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "inbox_delete_own" on public.inbox_items
  using (user_id = (select auth.uid()));
