-- Microsoft To Do is the source of truth. These tables are a private,
-- read-only-to-the-browser cache maintained by the server-side Graph adapter.
create table public.microsoft_todo_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  provider_list_id text not null check (char_length(provider_list_id) between 1 and 1024),
  display_name text not null check (char_length(display_name) between 1 and 500),
  is_default boolean not null default false,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, provider_list_id)
);

create table public.microsoft_todo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_list_id uuid not null references public.microsoft_todo_lists(id) on delete cascade,
  provider_task_id text not null check (char_length(provider_task_id) between 1 and 1024),
  title text not null default '' check (char_length(title) <= 500),
  body_text text,
  status text not null default 'notStarted' check (status in ('notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred')),
  importance text check (importance is null or importance in ('low', 'normal', 'high')),
  due_at timestamptz,
  completed_at timestamptz,
  provider_last_modified_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, provider_task_id)
);

create index microsoft_todo_lists_user_idx on public.microsoft_todo_lists (user_id, display_name) where archived_at is null;
create index microsoft_todo_tasks_user_status_idx on public.microsoft_todo_tasks (user_id, status, due_at) where archived_at is null;
create index microsoft_todo_tasks_list_idx on public.microsoft_todo_tasks (todo_list_id, status) where archived_at is null;

create trigger microsoft_todo_lists_updated_at before update on public.microsoft_todo_lists for each row execute procedure public.set_updated_at();
create trigger microsoft_todo_tasks_updated_at before update on public.microsoft_todo_tasks for each row execute procedure public.set_updated_at();

alter table public.microsoft_todo_lists enable row level security;
alter table public.microsoft_todo_tasks enable row level security;

-- Browser clients may view only their own cached To Do data. All mutations go
-- through authenticated Server Actions and the server-only Graph adapter.
create policy "microsoft_todo_lists_select_own" on public.microsoft_todo_lists for select to authenticated using ((select auth.uid()) = user_id);
create policy "microsoft_todo_tasks_select_own" on public.microsoft_todo_tasks for select to authenticated using ((select auth.uid()) = user_id);

comment on table public.microsoft_todo_lists is 'Private cache of Microsoft To Do lists. Microsoft To Do remains authoritative.';
comment on table public.microsoft_todo_tasks is 'Private cache of Microsoft To Do tasks. Browser clients cannot mutate this cache directly.';
