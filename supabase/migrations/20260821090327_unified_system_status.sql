-- One owner-scoped row per domain. This is an operational read model, not a
-- second copy of Tasks, Calendar, Notes, Files, Briefing, or AI data.
create table public.system_domain_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('tasks','calendar','notes','files','briefing','ai')),
  state text not null check (state in ('fresh','stale','syncing','failed','conflict','unavailable')),
  authority_source text not null,
  replica_role text not null,
  sync_direction text not null check (sync_direction in ('none','pull','push','bidirectional')),
  refresh_interval_seconds integer check (refresh_interval_seconds is null or refresh_interval_seconds between 60 and 2592000),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  retry_after timestamptz,
  retry_attempt integer not null default 0 check (retry_attempt between 0 and 30),
  error_code text,
  error_summary text check (error_summary is null or char_length(error_summary) <= 280),
  conflict_summary text check (conflict_summary is null or char_length(conflict_summary) <= 280),
  next_step text check (next_step is null or char_length(next_step) <= 280),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, domain)
);

-- Append-only, deliberately payload-free operation timeline. Error summaries
-- may describe a category only; raw provider responses and private content are
-- never written here.
create table public.system_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('tasks','calendar','notes','files','briefing','ai')),
  event_type text not null check (event_type in ('attempted','succeeded','failed','retry_scheduled','conflict_detected','unavailable')),
  operation_key text check (operation_key is null or char_length(operation_key) <= 160),
  error_code text,
  error_summary text check (error_summary is null or char_length(error_summary) <= 280),
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index system_domain_statuses_user_state_idx
  on public.system_domain_statuses (user_id, state, updated_at desc)
  where archived_at is null;
create index system_status_events_user_domain_created_idx
  on public.system_status_events (user_id, domain, created_at desc)
  where archived_at is null;
create unique index system_status_events_idempotency_idx
  on public.system_status_events (user_id, domain, event_type, operation_key)
  where operation_key is not null and archived_at is null;

create trigger system_domain_statuses_updated_at
  before update on public.system_domain_statuses
  for each row execute procedure public.set_updated_at();

alter table public.system_domain_statuses enable row level security;
alter table public.system_status_events enable row level security;

create policy "system_domain_statuses_select_own"
  on public.system_domain_statuses for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "system_status_events_select_own"
  on public.system_status_events for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));

-- A trusted server-side worker writes operational state. Browser clients get
-- read-only visibility and cannot forge health, retry, or conflict history.
revoke insert, update, delete on public.system_domain_statuses from anon, authenticated;
revoke insert, update, delete on public.system_status_events from anon, authenticated;

comment on table public.system_domain_statuses is
  'Owner-scoped operational read model; no domain content, tokens, keys, or provider payloads.';
comment on table public.system_status_events is
  'Append-only, payload-free status event timeline retained for 90 days by scheduled archival.';
