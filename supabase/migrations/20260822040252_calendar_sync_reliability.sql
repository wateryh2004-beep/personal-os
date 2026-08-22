-- Outlook is the calendar authority. Supabase keeps a private mirror plus
-- payload-free operational state; tokens and Graph event bodies never enter
-- these operational tables.
alter table public.calendar_connections
  add column if not exists calendar_near_delta_link text,
  add column if not exists calendar_near_window_start timestamptz,
  add column if not exists calendar_near_window_end timestamptz,
  add column if not exists calendar_subscription_id text,
  add column if not exists calendar_subscription_expires_at timestamptz,
  add column if not exists calendar_webhook_state_ciphertext text,
  add column if not exists calendar_webhook_last_received_at timestamptz,
  add column if not exists calendar_last_full_reconcile_at timestamptz,
  add column if not exists calendar_last_delta_sync_at timestamptz;

create table public.calendar_sync_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  near_history_days integer not null default 14 check (near_history_days between 1 and 90),
  near_forward_days integer not null default 60 check (near_forward_days between 7 and 365),
  hourly_interval_seconds integer not null default 3600 check (hourly_interval_seconds between 300 and 86400),
  full_reconcile_interval_seconds integer not null default 172800 check (full_reconcile_interval_seconds between 86400 and 1209600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  trigger_source text not null check (trigger_source in ('manual','scheduled','external_scheduler','webhook','recovery')),
  sync_mode text not null check (sync_mode in ('near_delta','near_full','full_reconcile','subscription_renewal')),
  status text not null check (status in ('queued','running','succeeded','failed','skipped')),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  event_count integer not null default 0 check (event_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  deleted_count integer not null default 0 check (deleted_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  error_summary text check (error_summary is null or char_length(error_summary) <= 280),
  next_scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.calendar_sync_queue (
  connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('manual','scheduled','external_scheduler','webhook','recovery')),
  requested_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_sync_leases (
  connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.calendar_sync_cron_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null check (trigger_source in ('scheduled','external_scheduler','webhook_worker')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  connection_count integer not null default 0 check (connection_count >= 0),
  succeeded_count integer not null default 0 check (succeeded_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  duration_ms integer,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  next_scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index calendar_sync_runs_connection_created_idx on public.calendar_sync_runs (connection_id, created_at desc) where archived_at is null;
create index calendar_sync_runs_user_status_idx on public.calendar_sync_runs (user_id, status, created_at desc) where archived_at is null;
create unique index calendar_sync_runs_one_active_per_connection_idx on public.calendar_sync_runs (connection_id) where status = 'running' and archived_at is null;
create index calendar_sync_queue_available_idx on public.calendar_sync_queue (available_at, requested_at);
create index calendar_sync_cron_runs_created_idx on public.calendar_sync_cron_runs (created_at desc) where archived_at is null;

create trigger calendar_sync_settings_updated_at before update on public.calendar_sync_settings for each row execute procedure public.set_updated_at();
create trigger calendar_sync_queue_updated_at before update on public.calendar_sync_queue for each row execute procedure public.set_updated_at();
create trigger calendar_sync_leases_updated_at before update on public.calendar_sync_leases for each row execute procedure public.set_updated_at();

alter table public.calendar_sync_settings enable row level security;
alter table public.calendar_sync_runs enable row level security;
alter table public.calendar_sync_queue enable row level security;
alter table public.calendar_sync_leases enable row level security;
alter table public.calendar_sync_cron_runs enable row level security;

create policy "calendar_sync_settings_select_own" on public.calendar_sync_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "calendar_sync_settings_insert_own" on public.calendar_sync_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "calendar_sync_settings_update_own" on public.calendar_sync_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_sync_runs_select_own" on public.calendar_sync_runs for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.calendar_sync_queue, public.calendar_sync_leases from anon, authenticated;
revoke all on public.calendar_sync_cron_runs from anon, authenticated;
revoke insert, update, delete on public.calendar_sync_runs from anon, authenticated;
grant select, insert, update on public.calendar_sync_settings to authenticated;
grant select on public.calendar_sync_runs to authenticated;

comment on table public.calendar_sync_runs is 'Payload-free Outlook calendar synchronization telemetry; raw Graph payloads, event bodies, OAuth tokens, and webhook secrets are excluded.';
