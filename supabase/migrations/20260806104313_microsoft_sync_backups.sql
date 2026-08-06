-- Immutable, user-owned cloud snapshots. Microsoft remains a synchronization
-- endpoint; these records make the Supabase project an independent backup.
create table public.microsoft_sync_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete restrict,
  trigger_source text not null check (trigger_source in ('manual', 'scheduled')),
  snapshot jsonb not null,
  calendar_event_count integer not null default 0 check (calendar_event_count >= 0),
  todo_list_count integer not null default 0 check (todo_list_count >= 0),
  todo_task_count integer not null default 0 check (todo_task_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index microsoft_sync_backups_user_created_idx
  on public.microsoft_sync_backups (user_id, created_at desc)
  where archived_at is null;

create trigger microsoft_sync_backups_updated_at
  before update on public.microsoft_sync_backups
  for each row execute procedure public.set_updated_at();

alter table public.microsoft_sync_backups enable row level security;

create policy "microsoft_sync_backups_select_own"
  on public.microsoft_sync_backups for select
  using ((select auth.uid()) = user_id);

-- Snapshots are append-only for browser roles. The authenticated server-side
-- integration worker owns creation, so users cannot tamper with history.
revoke insert, update, delete on public.microsoft_sync_backups from anon, authenticated;

comment on table public.microsoft_sync_backups is
  'Append-only user-owned cloud backups of Outlook calendar and Microsoft To Do data.';
