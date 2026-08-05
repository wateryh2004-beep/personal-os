-- Personal OS Phase 1. This migration is intentionally the sole source of schema changes.
-- Apply only to the linked project rurzksvjefwjvswjgiup after review.

create extension if not exists pgcrypto;

create type public.project_status as enum ('active', 'on_hold', 'completed', 'cancelled');
create type public.task_status as enum ('inbox', 'next', 'in_progress', 'waiting', 'completed', 'cancelled');
create type public.note_status as enum ('active', 'archived');
create type public.task_priority as enum ('none', 'low', 'medium', 'high');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Shanghai',
  locale text not null default 'zh-CN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.areas (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120), description text, icon text, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  name text not null check (char_length(name) between 1 and 180), description text, status public.project_status not null default 'active',
  start_date date, due_date date, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled', body_markdown text not null default '', status public.note_status not null default 'active', pinned_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.note_versions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  title text not null, body_markdown text not null, version_number integer not null check (version_number > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (note_id, version_number)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240), description text, status public.task_status not null default 'next',
  priority public.task_priority not null default 'none', due_at timestamptz, estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  completed_at timestamptz, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

-- Inbox is a first-class capture record; it is not an overloaded generic item.
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  content_markdown text not null check (char_length(content_markdown) between 1 and 10000), processed_at timestamptz,
  converted_task_id uuid references public.tasks(id) on delete set null, converted_note_id uuid references public.notes(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check (not (converted_task_id is not null and converted_note_id is not null))
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, action text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  action text not null, entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb,
  actor_type text not null default 'user', request_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create index areas_user_position_idx on public.areas (user_id, position) where archived_at is null;
create index projects_user_status_idx on public.projects (user_id, status) where archived_at is null;
create index projects_area_id_idx on public.projects (area_id);
create index notes_user_updated_idx on public.notes (user_id, updated_at desc) where archived_at is null;
create index notes_project_id_idx on public.notes (project_id);
create index note_versions_note_id_idx on public.note_versions (note_id, version_number desc);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at) where archived_at is null;
create index tasks_project_id_idx on public.tasks (project_id);
create index inbox_items_user_created_idx on public.inbox_items (user_id, created_at desc) where archived_at is null;
create index activity_events_user_created_idx on public.activity_events (user_id, created_at desc);
create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger areas_updated_at before update on public.areas for each row execute procedure public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute procedure public.set_updated_at();
create trigger notes_updated_at before update on public.notes for each row execute procedure public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute procedure public.set_updated_at();
create trigger inbox_items_updated_at before update on public.inbox_items for each row execute procedure public.set_updated_at();
create trigger activity_events_updated_at before update on public.activity_events for each row execute procedure public.set_updated_at();
create trigger audit_logs_updated_at before update on public.audit_logs for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.note_versions enable row level security;
alter table public.tasks enable row level security;
alter table public.inbox_items enable row level security;
alter table public.activity_events enable row level security;
alter table public.audit_logs enable row level security;

-- Regular tables: explicit policies for every operation. INSERT/UPDATE always validate auth.uid().
create policy "profiles_select_own" on public.profiles for select using (user_id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete using (user_id = auth.uid());
create policy "areas_select_own" on public.areas for select using (user_id = auth.uid());
create policy "areas_insert_own" on public.areas for insert with check (user_id = auth.uid());
create policy "areas_update_own" on public.areas for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "areas_delete_own" on public.areas for delete using (user_id = auth.uid());
create policy "projects_select_own" on public.projects for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_delete_own" on public.projects for delete using (user_id = auth.uid());
create policy "notes_select_own" on public.notes for select using (user_id = auth.uid());
create policy "notes_insert_own" on public.notes for insert with check (user_id = auth.uid());
create policy "notes_update_own" on public.notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes_delete_own" on public.notes for delete using (user_id = auth.uid());
create policy "tasks_select_own" on public.tasks for select using (user_id = auth.uid());
create policy "tasks_insert_own" on public.tasks for insert with check (user_id = auth.uid());
create policy "tasks_update_own" on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on public.tasks for delete using (user_id = auth.uid());
create policy "inbox_select_own" on public.inbox_items for select using (user_id = auth.uid());
create policy "inbox_insert_own" on public.inbox_items for insert with check (user_id = auth.uid());
create policy "inbox_update_own" on public.inbox_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "inbox_delete_own" on public.inbox_items for delete using (user_id = auth.uid());
create policy "activity_select_own" on public.activity_events for select using (user_id = auth.uid());
create policy "activity_insert_own" on public.activity_events for insert with check (user_id = auth.uid());
create policy "activity_update_own" on public.activity_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activity_delete_own" on public.activity_events for delete using (user_id = auth.uid());
create policy "audit_select_own" on public.audit_logs for select using (user_id = auth.uid());
create policy "audit_insert_own" on public.audit_logs for insert with check (user_id = auth.uid());
create policy "audit_update_own" on public.audit_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit_delete_own" on public.audit_logs for delete using (user_id = auth.uid());

-- Version rows are append-only. Ordinary users may read and insert only their own snapshots.
create policy "note_versions_select_own" on public.note_versions for select using (user_id = auth.uid());
create policy "note_versions_insert_own" on public.note_versions for insert with check (user_id = auth.uid() and created_by = auth.uid());

revoke update, delete on public.note_versions from anon, authenticated;
