-- Review and apply before enabling PDF_COVERS_ENABLED. No backfill runs here.
-- Originals stay private and unchanged. Only server jobs may publish derivatives.
create table public.pdf_cover_jobs (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_path text not null,
  source_bucket text not null,
  source_checksum text,
  source_size bigint not null check (source_size between 8 and 12582912),
  renderer_version text not null check (renderer_version ~ '^[a-z0-9][a-z0-9.-]{0,63}$'),
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  priority smallint not null default 0 check (priority between 0 and 10),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text check (output_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  output_size integer check (output_size between 1 and 131072),
  width integer check (width between 1 and 512),
  height integer check (height between 1 and 512),
  error_code text check (error_code is null or error_code ~ '^pdf_cover_[a-z_]{1,48}$'),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((status = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  check (status <> 'ready' or (source_sha256 is not null and output_sha256 is not null and storage_path is not null and output_size is not null and width is not null and height is not null)),
  check (source_path like user_id::text || '/files/' || document_id::text || '/%'),
  check (storage_path is null or storage_path = user_id::text || '/pdf-covers/' || document_id::text || '/' || renderer_version || '/' || source_sha256 || '.webp')
);
create index pdf_cover_jobs_owner_queue_idx on public.pdf_cover_jobs (user_id, priority desc, next_attempt_at, requested_at desc) where status <> 'ready';
alter table public.pdf_cover_jobs enable row level security;
revoke all on public.pdf_cover_jobs from anon, authenticated;
grant select on public.pdf_cover_jobs to authenticated;
grant all on public.pdf_cover_jobs to service_role;
create policy pdf_cover_jobs_select_own on public.pdf_cover_jobs for select to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.documents d where d.id = document_id and d.user_id = pdf_cover_jobs.user_id
    and d.archived_at is null and d.storage_state = 'available' and d.storage_provider = 'cloudflare_r2'
    and d.storage_path = source_path and d.storage_bucket = source_bucket and d.file_size = source_size
    and d.checksum is not distinct from source_checksum
));

-- Invoker-only service RPCs: no SECURITY DEFINER and no browser mutation grants.
create function public.enqueue_pdf_cover(p_user_id uuid, p_document_id uuid, p_renderer_version text, p_bucket text, p_priority integer default 0)
returns setof public.pdf_cover_jobs language plpgsql security invoker set search_path = '' as $$
declare d public.documents%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('pdf-cover:' || p_user_id::text,0));
  if p_renderer_version !~ '^[a-z0-9][a-z0-9.-]{0,63}$' then raise exception 'invalid renderer'; end if;
  select * into d from public.documents where id = p_document_id and user_id = p_user_id
    and archived_at is null and storage_provider = 'cloudflare_r2' and storage_state = 'available'
    and storage_bucket = p_bucket and storage_path like p_user_id::text || '/files/' || p_document_id::text || '/%'
    and file_size between 8 and 12582912
    and (lower(mime_type) = 'application/pdf' or (lower(mime_type) = 'application/octet-stream' and lower(original_filename) like '%.pdf'))
    for share;
  if not found then return; end if;
  -- Reset only on a changed source or renderer. Repeated requests never reset attempts.
  if exists (select 1 from public.pdf_cover_jobs j where j.document_id = d.id and
    (j.user_id <> d.user_id or j.source_path <> d.storage_path or j.source_bucket <> d.storage_bucket or
     j.source_size <> d.file_size or j.source_checksum is distinct from d.checksum or j.renderer_version <> p_renderer_version)) then
    -- Retain a running lease until expiry even after invalidation, so a new
    -- source cannot admit a second concurrent render for this owner.
    if exists (select 1 from public.pdf_cover_jobs j where j.document_id = d.id and j.status = 'processing' and j.lease_expires_at > now()) then
      return query select * from public.pdf_cover_jobs where document_id = d.id;
      return;
    end if;
    delete from public.pdf_cover_jobs where document_id = d.id;
  end if;
  return query insert into public.pdf_cover_jobs (document_id,user_id,source_path,source_bucket,source_checksum,source_size,renderer_version,priority)
    values (d.id,d.user_id,d.storage_path,d.storage_bucket,d.checksum,d.file_size,p_renderer_version,least(10,greatest(0,p_priority)))
    on conflict (document_id) do update set priority = greatest(pdf_cover_jobs.priority,excluded.priority),
      requested_at = now(), updated_at = now()
    returning *;
end; $$;

create function public.claim_pdf_cover(p_user_id uuid, p_renderer_version text, p_document_id uuid default null)
returns setof public.pdf_cover_jobs language plpgsql security invoker set search_path = '' as $$
declare claimed uuid;
begin
  -- Serialize claims per owner across server instances; only one live render lease.
  if not pg_try_advisory_xact_lock(hashtextextended('pdf-cover:' || p_user_id::text,0)) then return; end if;
  update public.pdf_cover_jobs set status = 'failed', error_code = 'pdf_cover_attempts_exhausted', next_attempt_at = null,
    lease_token = null, lease_expires_at = null, updated_at = now()
    where user_id = p_user_id and status = 'processing' and lease_expires_at <= now() and attempts >= 3;
  if exists (select 1 from public.pdf_cover_jobs where user_id = p_user_id and status = 'processing' and lease_expires_at > now()) then return; end if;
  select j.document_id into claimed from public.pdf_cover_jobs j join public.documents d on d.id = j.document_id and d.user_id = j.user_id
    where j.user_id = p_user_id and j.renderer_version = p_renderer_version and (p_document_id is null or j.document_id = p_document_id)
      and j.attempts < 3 and ((j.status in ('pending','failed') and j.next_attempt_at <= now()) or (j.status = 'processing' and j.lease_expires_at <= now()))
      and d.archived_at is null and d.storage_state = 'available' and d.storage_provider = 'cloudflare_r2'
      and d.storage_path = j.source_path and d.storage_bucket = j.source_bucket and d.file_size = j.source_size and d.checksum is not distinct from j.source_checksum
      and (lower(d.mime_type) = 'application/pdf' or (lower(d.mime_type) = 'application/octet-stream' and lower(d.original_filename) like '%.pdf'))
    order by j.priority desc, j.requested_at desc, j.created_at
    for update of j skip locked limit 1;
  if claimed is null then return; end if;
  return query update public.pdf_cover_jobs set status = 'processing', attempts = attempts + 1, lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '60 seconds', next_attempt_at = null, error_code = null, updated_at = now()
    where document_id = claimed and user_id = p_user_id returning *;
end; $$;

create function public.finish_pdf_cover(p_user_id uuid, p_document_id uuid, p_lease_token uuid, p_success boolean,
  p_source_sha256 text default null, p_output_sha256 text default null, p_output_size integer default null,
  p_width integer default null, p_height integer default null, p_error_code text default null, p_retryable boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.documents%rowtype; changed integer;
begin
  -- Lock source before job, as enqueue does. Archive/replace races cannot publish.
  select * into d from public.documents where id = p_document_id and user_id = p_user_id for share;
  if not found or d.archived_at is not null or d.storage_state <> 'available' or d.storage_provider <> 'cloudflare_r2' then return false; end if;
  if not (lower(d.mime_type) = 'application/pdf' or (lower(d.mime_type) = 'application/octet-stream' and lower(d.original_filename) like '%.pdf')) then return false; end if;
  update public.pdf_cover_jobs j set status = case when p_success then 'ready' else 'failed' end,
    source_sha256 = case when p_success then p_source_sha256 else null end,
    output_sha256 = case when p_success then p_output_sha256 else null end,
    storage_path = case when p_success then j.user_id::text || '/pdf-covers/' || j.document_id::text || '/' || j.renderer_version || '/' || p_source_sha256 || '.webp' else null end,
    output_size = case when p_success then p_output_size else null end,
    width = case when p_success then p_width else null end, height = case when p_success then p_height else null end,
    error_code = case when p_success then null else p_error_code end,
    next_attempt_at = case when not p_success and p_retryable and j.attempts < 3 then now() + make_interval(secs => 30 * (2 ^ (j.attempts - 1))::integer) else null end,
    lease_token = null, lease_expires_at = null, updated_at = now()
    where j.document_id = p_document_id and j.user_id = p_user_id and j.status = 'processing'
      and j.lease_token = p_lease_token and j.lease_expires_at > now()
      and j.source_path = d.storage_path and j.source_bucket = d.storage_bucket and j.source_size = d.file_size and j.source_checksum is not distinct from d.checksum
      and (not p_success or d.checksum is null or d.checksum = p_source_sha256);
  get diagnostics changed = row_count;
  return changed = 1;
end; $$;

-- Bounded discovery catches old documents and uploads whose best-effort kick died.
-- It only enqueues missing/stale versions and never retries terminal failures.
create function public.backfill_pdf_covers(p_user_id uuid, p_renderer_version text, p_bucket text, p_limit integer default 3)
returns integer language plpgsql security invoker set search_path = '' as $$
declare candidate record; queued integer := 0;
begin
  for candidate in select d.id from public.documents d left join public.pdf_cover_jobs j on j.document_id = d.id
    where d.user_id = p_user_id and d.archived_at is null and d.storage_state = 'available' and d.storage_provider = 'cloudflare_r2'
      and d.storage_bucket = p_bucket and d.storage_path like p_user_id::text || '/files/' || d.id::text || '/%' and d.file_size between 8 and 12582912
      and (lower(d.mime_type) = 'application/pdf' or (lower(d.mime_type) = 'application/octet-stream' and lower(d.original_filename) like '%.pdf'))
      and (j.document_id is null or j.source_path <> d.storage_path or j.source_bucket <> d.storage_bucket or j.source_size <> d.file_size or j.source_checksum is distinct from d.checksum or j.renderer_version <> p_renderer_version)
    order by d.uploaded_at desc, d.id limit least(10,greatest(0,p_limit))
  loop
    perform public.enqueue_pdf_cover(p_user_id,candidate.id,p_renderer_version,p_bucket,0);
    queued := queued + 1;
  end loop;
  return queued;
end; $$;

revoke all on function public.enqueue_pdf_cover(uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.claim_pdf_cover(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.finish_pdf_cover(uuid,uuid,uuid,boolean,text,text,integer,integer,integer,text,boolean) from public, anon, authenticated;
revoke all on function public.backfill_pdf_covers(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.enqueue_pdf_cover(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.claim_pdf_cover(uuid,text,uuid) to service_role;
grant execute on function public.finish_pdf_cover(uuid,uuid,uuid,boolean,text,text,integer,integer,integer,text,boolean) to service_role;
grant execute on function public.backfill_pdf_covers(uuid,text,text,integer) to service_role;

-- Missing derived objects can be rebuilt, but neither reads nor failures reset
-- the finite attempt budget. Corrupt immutable objects are never overwritten.
create function public.invalidate_pdf_cover_artifact(p_user_id uuid, p_document_id uuid, p_renderer_version text,
  p_source_sha256 text, p_output_sha256 text, p_retryable boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  update public.pdf_cover_jobs j set status = case when p_retryable and attempts < 3 then 'pending' else 'failed' end,
    next_attempt_at = case when p_retryable and attempts < 3 then now() else null end,
    output_sha256 = null, source_sha256 = null, output_size = null, width = null, height = null, storage_path = null,
    error_code = case when p_retryable then 'pdf_cover_artifact_missing' else 'pdf_cover_artifact_corrupt' end, updated_at = now()
    where j.document_id = p_document_id and j.user_id = p_user_id and j.status = 'ready'
      and j.renderer_version = p_renderer_version and j.source_sha256 = p_source_sha256 and j.output_sha256 = p_output_sha256;
  get diagnostics changed = row_count;
  return changed = 1;
end; $$;
revoke all on function public.invalidate_pdf_cover_artifact(uuid,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.invalidate_pdf_cover_artifact(uuid,uuid,text,text,text,boolean) to service_role;
