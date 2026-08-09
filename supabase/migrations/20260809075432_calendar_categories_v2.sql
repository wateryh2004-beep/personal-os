-- Outlook remains authoritative. Personal OS stores a private, read-only
-- event/category cache and sends all writes through the confirmed server queue.

alter table public.calendar_connections
  add column granted_scopes text[] not null default '{}'::text[],
  add column oauth_scope_version integer not null default 1 check (oauth_scope_version between 1 and 100);

alter table public.calendar_events
  add column categories text[] not null default '{}'::text[],
  add column body_text text,
  add column importance text not null default 'normal' check (importance in ('low', 'normal', 'high')),
  add column show_as text not null default 'busy' check (show_as in ('free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'));

create table public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_category_id text,
  display_name text not null check (char_length(display_name) between 1 and 255),
  color text not null default 'None' check (color = 'None' or color ~ '^preset([0-9]|1[0-9]|2[0-4])$'),
  managed_key text,
  category_kind text not null default 'external' check (category_kind in ('primary', 'context', 'external')),
  ai_description text,
  keywords text[] not null default '{}'::text[],
  display_order integer not null default 0,
  is_ai_managed boolean not null default false,
  ai_enabled boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, display_name)
);

create unique index calendar_categories_provider_id_idx
  on public.calendar_categories (user_id, provider_category_id)
  where provider_category_id is not null;
create index calendar_categories_user_order_idx
  on public.calendar_categories (user_id, display_order, display_name)
  where archived_at is null;
create index calendar_events_user_categories_idx
  on public.calendar_events using gin (categories)
  where archived_at is null;

create trigger calendar_categories_updated_at
  before update on public.calendar_categories
  for each row execute procedure public.set_updated_at();

alter table public.calendar_categories enable row level security;
alter table public.calendar_categories force row level security;

create policy "calendar_categories_select_own"
  on public.calendar_categories
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.calendar_categories to authenticated;
revoke insert, update, delete on public.calendar_categories from anon, authenticated;

comment on table public.calendar_categories is 'Private cache of Outlook master categories. Outlook is authoritative; browser users can only read their own rows.';
comment on column public.calendar_connections.oauth_scope_version is '1=legacy Calendar/To Do scopes; 2=includes MailboxSettings.ReadWrite for Outlook category sync.';
comment on column public.calendar_events.categories is 'Exact Outlook event.categories display names; external names are preserved.';
