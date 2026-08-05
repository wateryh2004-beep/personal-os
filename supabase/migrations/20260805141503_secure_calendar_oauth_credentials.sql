-- Credentials are never accessible to browser roles. Service role bypasses
-- RLS only inside the authenticated server-only Microsoft adapter.
alter table private.calendar_oauth_credentials enable row level security;
