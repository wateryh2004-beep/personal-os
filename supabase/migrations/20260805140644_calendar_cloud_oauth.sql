-- Cloud-only Microsoft Calendar credentials. The refresh token is encrypted
-- by the Vercel server before it reaches this table. This private schema is
-- not exposed through PostgREST or to browser clients.

alter table public.calendar_connections
  alter column label set default 'Microsoft Outlook',
  add column provider text not null default 'microsoft_graph_public_client'
    check (provider = 'microsoft_graph_public_client'),
  add column oauth_connected_at timestamptz;

create table private.calendar_oauth_credentials (
  connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  refresh_token_ciphertext text not null check (char_length(refresh_token_ciphertext) > 40),
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_oauth_credentials_updated_at
  before update on private.calendar_oauth_credentials
  for each row execute procedure public.set_updated_at();

revoke all on table private.calendar_oauth_credentials from public, anon, authenticated;

comment on table private.calendar_oauth_credentials is
  'Server-only encrypted Microsoft refresh credentials. Never expose via PostgREST.';
