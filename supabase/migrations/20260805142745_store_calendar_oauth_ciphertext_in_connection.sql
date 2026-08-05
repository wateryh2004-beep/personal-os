-- Supabase's HTTP Data API intentionally cannot access the non-exposed private
-- schema. Keep only encrypted credential material on the existing RLS-protected
-- connection row so the server-only adapter can renew the Microsoft session.
alter table public.calendar_connections
  add column oauth_refresh_token_ciphertext text,
  add column oauth_token_expires_at timestamptz;

update public.calendar_connections as connection
set oauth_refresh_token_ciphertext = credential.refresh_token_ciphertext,
    oauth_token_expires_at = credential.token_expires_at
from private.calendar_oauth_credentials as credential
where credential.connection_id = connection.id
  and credential.user_id = connection.user_id;

comment on column public.calendar_connections.oauth_refresh_token_ciphertext is
  'AES-256-GCM ciphertext only; the server-only SUPABASE_SECRET_KEY-derived key is never stored in PostgreSQL.';
