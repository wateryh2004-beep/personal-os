-- Ordinary and outer-vault document pointers must never alias an inner
-- object, even if an authenticated client knows a previously signed key.
alter table public.documents add constraint documents_no_inner_vault_key
  check (position('/inner-vault/' in storage_path) = 0);

-- Inner-vault files are independent of documents and never join ordinary/outer
-- listings, search, AI, or backups. Their R2 key contains no original filename.
create table public.inner_vault_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table public.inner_vault_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 6)
);
create table public.inner_vault_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  outer_token_hash text not null references public.vault_sessions(token_hash) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index inner_vault_sessions_outer_idx on public.inner_vault_sessions(outer_token_hash);
create table public.inner_vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null check (length(original_filename) between 1 and 180),
  file_size bigint not null check (file_size between 1 and 2147483648),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  storage_bucket text not null,
  storage_path text generated always as (user_id::text || '/inner-vault/' || id::text || '/archive.zip') stored,
  upload_id text,
  status text not null default 'initializing' check (status in ('initializing','uploading','completing','completed','aborting','aborted','failed','expired')),
  lease_token uuid,
  lease_expires_at timestamptz,
  expires_at timestamptz not null default now()+interval '6 days',
  created_at timestamptz not null default now(),
  saved_at timestamptz,
  check ((lease_token is null)=(lease_expires_at is null)),
  check ((status='completed')=(saved_at is not null))
);
create index inner_vault_files_owner_idx on public.inner_vault_files(user_id, created_at desc, id desc);
create unique index inner_vault_upload_identity_idx on public.inner_vault_files(user_id, original_filename, file_size, checksum)
  where status not in ('aborted','expired');

do $$ declare t text; begin
  foreach t in array array['inner_vault_credentials','inner_vault_attempts','inner_vault_sessions','inner_vault_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create function public.inner_vault_consume_attempt(p_user_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  insert into public.inner_vault_attempts(user_id) values(p_user_id) on conflict do nothing;
  update public.inner_vault_attempts
    set attempts=case when window_started_at < clock_timestamp()-interval '15 minutes' then 1 else least(6,attempts+1) end,
      window_started_at=case when window_started_at < clock_timestamp()-interval '15 minutes' then clock_timestamp() else window_started_at end
    where user_id=p_user_id returning attempts into n;
  return n<=5;
end $$;

-- Lock both session rows so publication and explicit locking are ordered.
create function public.inner_vault_assert_session(p_user_id uuid,p_outer text,p_login text,p_inner text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.vault_sessions where user_id=p_user_id and token_hash=p_outer and login_session=p_login
    and expires_at>clock_timestamp() and last_seen_at>clock_timestamp()-interval '5 minutes' for share;
  if not found then raise exception 'vault_locked'; end if;
  perform 1 from public.inner_vault_sessions where user_id=p_user_id and outer_token_hash=p_outer and token_hash=p_inner
    and expires_at>clock_timestamp() and last_seen_at>clock_timestamp()-interval '5 minutes' for share;
  if not found then raise exception 'inner_vault_locked'; end if;
end $$;

create function public.inner_vault_prepare_file(p_user_id uuid,p_outer text,p_login text,p_inner text,
  p_filename text,p_size bigint,p_checksum text,p_bucket text) returns public.inner_vault_files
language plpgsql security invoker set search_path='' as $$
declare f public.inner_vault_files;
begin
  perform public.inner_vault_assert_session(p_user_id,p_outer,p_login,p_inner);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,892));
  update public.inner_vault_files set status='expired',lease_token=null,lease_expires_at=null
    where user_id=p_user_id and original_filename=p_filename and file_size=p_size and checksum=p_checksum
      and status not in ('completed','aborted','expired') and expires_at<=clock_timestamp()
      and (lease_expires_at is null or lease_expires_at<=clock_timestamp());
  select * into f from public.inner_vault_files where user_id=p_user_id and original_filename=p_filename
    and file_size=p_size and checksum=p_checksum and status not in ('aborted','expired');
  if found then return f; end if;
  if (select count(*) from public.inner_vault_files where user_id=p_user_id and status not in ('completed','aborted','expired')
      and expires_at>clock_timestamp()) >= 20 then raise exception 'inner_vault_upload_limit'; end if;
  insert into public.inner_vault_files(user_id,original_filename,file_size,checksum,storage_bucket)
    values(p_user_id,p_filename,p_size,p_checksum,p_bucket) returning * into f;
  return f;
end $$;

create function public.inner_vault_publish_file(p_user_id uuid,p_outer text,p_login text,p_inner text,p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform public.inner_vault_assert_session(p_user_id,p_outer,p_login,p_inner);
  update public.inner_vault_files set status='completed',saved_at=clock_timestamp(),upload_id=null,lease_token=null,lease_expires_at=null
    where id=p_id and user_id=p_user_id and status='completing' and lease_token=p_lease and lease_expires_at>clock_timestamp();
  if not found then return false; end if;
  -- Keep the completion timestamp here so it never appears in ordinary audit outputs.
  return true;
end $$;

revoke all on function public.inner_vault_consume_attempt(uuid),
  public.inner_vault_assert_session(uuid,text,text,text),
  public.inner_vault_prepare_file(uuid,text,text,text,text,bigint,text,text),
  public.inner_vault_publish_file(uuid,text,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.inner_vault_consume_attempt(uuid),
  public.inner_vault_assert_session(uuid,text,text,text),
  public.inner_vault_prepare_file(uuid,text,text,text,text,bigint,text,text),
  public.inner_vault_publish_file(uuid,text,text,text,uuid,uuid) to service_role;
