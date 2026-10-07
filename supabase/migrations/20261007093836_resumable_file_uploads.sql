alter table public.documents drop constraint if exists documents_storage_state_check;
alter table public.documents add constraint documents_storage_state_check check(storage_state in ('pending','available','archived','cancelled'));

-- Operational state only: private R2 multipart IDs cannot be restored as uploads.
alter table public.documents add column upload_mode text not null default 'single' check(upload_mode in ('single','multipart'));
create table public.file_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete cascade,
  identity_key text not null check(identity_key ~ '^[a-f0-9]{64}$'),
  storage_path text not null, storage_bucket text not null,
  upload_id text,
  status text not null default 'initializing' check(status in ('initializing','uploading','completing','uploaded','completed','aborting','aborted','expired','failed')),
  part_size integer not null default 8388608 check(part_size=8388608),
  file_size bigint not null check(file_size between 1 and 104857600),
  checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
  lease_token uuid, lease_expires_at timestamptz,
  expires_at timestamptz not null default now()+interval '6 days',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((lease_token is null)=(lease_expires_at is null))
);
create index file_upload_sessions_owner_idx on public.file_upload_sessions(user_id,updated_at desc);
create unique index file_upload_sessions_identity_idx on public.file_upload_sessions(user_id,identity_key) where status not in ('aborted','expired');
alter table public.file_upload_sessions enable row level security;
alter table public.file_upload_sessions force row level security;
-- Provider upload IDs and transitions are never directly writable/readable by clients.
revoke all on public.file_upload_sessions from public,anon,authenticated;
grant all on public.file_upload_sessions to service_role;

create function public.prepare_file_upload_session(p_user_id uuid,p_identity_key text,p_filename text,p_content_type text,p_file_size bigint,p_checksum text,p_folder_id uuid,p_bucket text,p_extraction_status text)
returns public.file_upload_sessions language plpgsql security invoker set search_path='' as $$
declare s public.file_upload_sessions; doc_id uuid; object_path text;
begin
  if p_user_id is null or p_file_size not between 1 and 104857600 or p_checksum !~ '^[a-f0-9]{64}$' or p_identity_key !~ '^[a-f0-9]{64}$'
    or length(p_filename) not between 1 and 180 or p_filename ~ '[\\/]' then raise exception 'invalid upload'; end if;
  -- Bound duplicates across retries and devices, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  update public.file_upload_sessions set status='expired',lease_token=case when lease_expires_at>now() then lease_token else null end,lease_expires_at=case when lease_expires_at>now() then lease_expires_at else null end,updated_at=now()
    where user_id=p_user_id and identity_key=p_identity_key and expires_at<=now() and status not in ('aborted','expired');
  select * into s from public.file_upload_sessions where user_id=p_user_id and identity_key=p_identity_key and status not in ('aborted','expired') for update;
  if found then return s; end if;
  if (select count(*) from public.file_upload_sessions pending_session join public.documents pending_document on pending_document.id=pending_session.document_id where pending_session.user_id=p_user_id and pending_session.expires_at>now() and pending_document.storage_state='pending' and pending_session.status in ('initializing','uploading','completing','uploaded','aborting','failed')) >= 20 then
    raise exception 'too many active uploads';
  end if;
  if p_folder_id is not null and not exists(select 1 from public.file_folders where id=p_folder_id and user_id=p_user_id and archived_at is null) then raise exception 'invalid folder'; end if;
  doc_id:=gen_random_uuid(); object_path:=p_user_id::text||'/files/'||doc_id::text||'/'||p_filename;
  insert into public.documents(id,user_id,title,document_type,original_filename,storage_bucket,storage_path,storage_provider,storage_state,mime_type,file_size,folder_id,checksum,text_extraction_status,upload_mode)
    values(doc_id,p_user_id,p_filename,'other',p_filename,p_bucket,object_path,'cloudflare_r2','pending',p_content_type,p_file_size,p_folder_id,p_checksum,p_extraction_status,'multipart');
  insert into public.file_upload_sessions(user_id,document_id,identity_key,storage_path,storage_bucket,file_size,checksum)
    values(p_user_id,doc_id,p_identity_key,object_path,p_bucket,p_file_size,p_checksum) returning * into s;
  return s;
end; $$;

create function public.claim_file_upload_operation(p_user_id uuid,p_session_id uuid,p_operation text,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.file_upload_sessions; d public.documents;
begin
  select * into s from public.file_upload_sessions where id=p_session_id and user_id=p_user_id;
  if not found or p_token is null then return false; end if;
  select * into d from public.documents where id=s.document_id and user_id=p_user_id for update;
  select * into s from public.file_upload_sessions where id=p_session_id and user_id=p_user_id for update;
  if d.id is null or d.storage_state<>'pending' or d.archived_at is not null or d.upload_mode<>'multipart'
    or d.storage_path<>s.storage_path or d.file_size<>s.file_size or d.checksum is distinct from s.checksum
    or (s.lease_expires_at is not null and s.lease_expires_at>now()) then return false; end if;
  if p_operation='initialize' and s.status='initializing' and s.expires_at>now() then null;
  elsif p_operation='complete' and s.status in ('uploading','completing') and s.expires_at>now() then null;
  elsif p_operation='abort' and (s.status in ('initializing','uploading','aborting','expired','failed') or (s.expires_at<=now() and s.status in ('completing','uploaded'))) then null;
  else return false; end if;
  update public.file_upload_sessions set status=case p_operation when 'initialize' then 'initializing' when 'complete' then 'completing' else 'aborting' end,
    lease_token=p_token,lease_expires_at=now()+interval '330 seconds',updated_at=now() where id=s.id;
  return true;
end; $$;
revoke all on function public.prepare_file_upload_session(uuid,text,text,text,bigint,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_file_upload_operation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_file_upload_session(uuid,text,text,text,bigint,text,uuid,text,text) to service_role;
grant execute on function public.claim_file_upload_operation(uuid,uuid,text,uuid) to service_role;


-- Operational audit records contain document IDs and status, never provider IDs.
create function public.audit_file_upload_session() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
      values(new.user_id,'upload_requested','document',new.document_id,'user',jsonb_build_object('size',new.file_size,'upload_mode','multipart'));
  elsif new.status='aborted' and old.status is distinct from new.status then
    insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
      values(new.user_id,'upload_aborted','document',new.document_id,'user',jsonb_build_object('upload_mode','multipart'));
  end if;
  return new;
end; $$;
create trigger audit_file_upload_session after insert or update on public.file_upload_sessions for each row execute function public.audit_file_upload_session();
revoke all on function public.audit_file_upload_session() from public,anon,authenticated;


-- Publication and expired-session cancellation share document -> session lock order.
-- Only the authenticated server's verified, sealed candidate reaches this RPC.
create function public.publish_file_upload_session(p_user_id uuid,p_document_id uuid,p_source_path text,p_final_path text,p_checksum text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.documents; s public.file_upload_sessions;
begin
  select * into d from public.documents where id=p_document_id and user_id=p_user_id for update;
  if not found or d.storage_state<>'pending' or d.archived_at is not null or d.upload_mode<>'multipart'
    or d.storage_path<>p_source_path or d.checksum is distinct from p_checksum or p_checksum !~ '^[a-f0-9]{64}$'
    or p_final_path not like p_user_id::text||'/files/'||p_document_id::text||'/sealed-%/%' then return false; end if;
  select * into s from public.file_upload_sessions where document_id=p_document_id and user_id=p_user_id for update;
  if not found or s.status<>'uploaded' or s.storage_path<>d.storage_path or s.storage_bucket<>d.storage_bucket
    or s.file_size<>d.file_size or s.checksum is distinct from d.checksum then return false; end if;
  update public.documents set storage_state='available',storage_path=p_final_path,checksum=p_checksum,uploaded_at=now() where id=d.id;
  update public.file_upload_sessions set status='completed',updated_at=now() where id=s.id;
  return true;
end; $$;
revoke all on function public.publish_file_upload_session(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_file_upload_session(uuid,uuid,text,text,text) to service_role;


-- Explicit cancellation is terminal metadata, not an unresolved committed original.
create function public.finish_file_upload_abort(p_user_id uuid,p_session_id uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.file_upload_sessions; d public.documents;
begin
  select * into s from public.file_upload_sessions where id=p_session_id and user_id=p_user_id;
  if not found then return false; end if;
  select * into d from public.documents where id=s.document_id and user_id=p_user_id for update;
  select * into s from public.file_upload_sessions where id=p_session_id and user_id=p_user_id for update;
  if s.status='aborted' and d.storage_state='cancelled' then return true; end if;
  if d.id is null or d.storage_state<>'pending' or d.archived_at is not null or d.upload_mode<>'multipart'
    or s.status<>'aborting' or s.lease_token is distinct from p_token or p_token is null then return false; end if;
  update public.documents set storage_state='cancelled' where id=d.id;
  update public.file_upload_sessions set status='aborted',lease_token=null,lease_expires_at=null,updated_at=now() where id=s.id;
  return true;
end; $$;
revoke all on function public.finish_file_upload_abort(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_file_upload_abort(uuid,uuid,uuid) to service_role;
