-- Microsoft Calendar integration. Outlook remains the source of truth; this is
-- a per-user cache plus an explicitly confirmed command queue for the local
-- Companion. No Microsoft access or refresh token is stored in Supabase.

create type public.calendar_operation_type as enum ('sync', 'create', 'update', 'delete');
create type public.calendar_operation_status as enum ('pending_confirmation', 'queued', 'processing', 'succeeded', 'failed', 'cancelled');

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  label text not null default '此 Mac' check (char_length(label) between 1 and 120),
  status text not null default 'enabled' check (status in ('enabled', 'disabled')),
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 1024),
  calendar_id text,
  subject text not null default '' check (char_length(subject) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  location_name text,
  provider_change_key text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (ends_at > starts_at),
  unique (user_id, provider_event_id)
);

create table public.calendar_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete restrict,
  operation_type public.calendar_operation_type not null,
  status public.calendar_operation_status not null default 'pending_confirmation',
  provider_event_id text,
  calendar_id text,
  payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  error_code text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index calendar_events_user_starts_at_idx on public.calendar_events (user_id, starts_at) where archived_at is null;
create index calendar_operations_connection_status_idx on public.calendar_operations (connection_id, status, requested_at) where archived_at is null;
create index calendar_operations_user_created_at_idx on public.calendar_operations (user_id, created_at desc) where archived_at is null;

create schema if not exists private;
revoke all on schema private from public;

-- An authenticated browser may prepare or cancel only its own command. It may
-- never change a claimed command, its payload, or mark a command successful.
-- The server-only bridge uses the service role after bearer-token validation.
create function private.enforce_calendar_operation_transition() returns trigger language plpgsql set search_path = public, auth, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending_confirmation' and new.operation_type = 'create' then return new; end if;
    if new.status = 'queued' and new.operation_type = 'sync' then return new; end if;
    raise exception 'calendar operation must be created as a draft or a sync request';
  end if;

  if auth.role() = 'service_role' then return new; end if;

  if old.status = 'pending_confirmation'
    and new.status in ('queued', 'cancelled')
    and new.user_id = old.user_id
    and new.connection_id = old.connection_id
    and new.operation_type = old.operation_type
    and new.provider_event_id is not distinct from old.provider_event_id
    and new.calendar_id is not distinct from old.calendar_id
    and new.payload = old.payload
    and new.result is not distinct from old.result
    and new.error_code is not distinct from old.error_code
  then return new; end if;

  if old.status = 'queued'
    and new.status = 'cancelled'
    and new.user_id = old.user_id
    and new.connection_id = old.connection_id
    and new.operation_type = old.operation_type
    and new.provider_event_id is not distinct from old.provider_event_id
    and new.calendar_id is not distinct from old.calendar_id
    and new.payload = old.payload
    and new.result is not distinct from old.result
    and new.error_code is not distinct from old.error_code
  then return new; end if;

  raise exception 'invalid calendar operation transition';
end;
$$;
revoke all on function private.enforce_calendar_operation_transition() from public;

create trigger calendar_connections_updated_at before update on public.calendar_connections for each row execute procedure public.set_updated_at();
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute procedure public.set_updated_at();
create trigger calendar_operations_updated_at before update on public.calendar_operations for each row execute procedure public.set_updated_at();
create trigger calendar_operations_transition before insert or update on public.calendar_operations for each row execute procedure private.enforce_calendar_operation_transition();

alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_operations enable row level security;

create policy "calendar_connections_select_own" on public.calendar_connections for select using (user_id = auth.uid());
create policy "calendar_connections_insert_own" on public.calendar_connections for insert with check (user_id = auth.uid());
create policy "calendar_connections_update_own" on public.calendar_connections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calendar_connections_delete_own" on public.calendar_connections for delete using (user_id = auth.uid());

create policy "calendar_events_select_own" on public.calendar_events for select using (user_id = auth.uid());

create policy "calendar_operations_select_own" on public.calendar_operations for select using (user_id = auth.uid());
create policy "calendar_operations_insert_own" on public.calendar_operations for insert with check (user_id = auth.uid());
create policy "calendar_operations_update_own" on public.calendar_operations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
