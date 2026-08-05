-- One owner may have several browsers open. Persist the short-lived request
-- lease with their encrypted provider settings so concurrent requests are
-- rejected deterministically across Vercel instances and devices.
alter table public.ai_provider_settings
  add column calendar_request_id uuid,
  add column calendar_request_started_at timestamptz,
  add column calendar_request_expires_at timestamptz;

create index ai_provider_settings_calendar_request_expires_idx
  on public.ai_provider_settings (calendar_request_expires_at)
  where calendar_request_id is not null;
