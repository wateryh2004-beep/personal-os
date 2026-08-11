alter table public.calendar_connections
  add column if not exists calendar_delta_link text,
  add column if not exists calendar_sync_window_start timestamptz,
  add column if not exists calendar_sync_window_end timestamptz;

comment on column public.calendar_connections.calendar_delta_link is 'Microsoft Graph calendarView deltaLink, scoped to the stored sync window.';
