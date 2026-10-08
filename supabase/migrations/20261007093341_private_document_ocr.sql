-- Explicit, private browser-local OCR. No enqueue/backfill/cron or object writes.
-- Latest successful derived-text provenance survives cancelled/failed retries.
alter table public.documents
  add column text_extraction_method text check(text_extraction_method in ('native','ocr_local')),
  add column text_extraction_engine_version text,
  add column text_extraction_model_version text,
  add column text_extraction_source_sha256 text check(text_extraction_source_sha256 ~ '^[a-f0-9]{64}$'),
  add column text_extraction_page_count integer check(text_extraction_page_count between 1 and 10),
  add column text_extraction_empty_pages integer check(text_extraction_empty_pages between 0 and text_extraction_page_count);
create table public.document_ocr_jobs (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_path text not null, source_bucket text not null, source_checksum text,
  source_size bigint not null check(source_size between 1 and 20971520),
  engine_version text not null default 'tesseract7-eng-chi-sim-v1',
  status text not null check(status in ('processing','completed','failed','cancelled')),
  run_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  pages_completed integer not null default 0 check(pages_completed between 0 and 10),
  empty_pages integer not null default 0 check(empty_pages between 0 and 10),
  page_count integer check(page_count between 1 and 10),
  error_code text, source_sha256 text check(source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.document_ocr_jobs enable row level security;
create policy document_ocr_owner_read on public.document_ocr_jobs for select to authenticated
  using(user_id = (select auth.uid()) and exists (
    select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid())
      and d.archived_at is null and d.storage_state='available'
  ));
revoke all on public.document_ocr_jobs from anon, authenticated;
grant select on public.document_ocr_jobs to authenticated;
create index document_ocr_owner_active on public.document_ocr_jobs(user_id,lease_expires_at) where status='processing';

-- Definer is needed to keep job writes behind atomic, source-guarded transitions.
-- Every RPC derives ownership from the authenticated session; no caller owner ID.
create function public.start_document_ocr(p_document_id uuid)
returns setof public.document_ocr_jobs language plpgsql security definer set search_path='' as $$
declare d public.documents; owner uuid := auth.uid();
begin
  if owner is null then raise exception 'ocr_unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,743));
  select * into d from public.documents where id=p_document_id and user_id=owner
    and archived_at is null and storage_state='available' and storage_provider='cloudflare_r2' for update;
  if not found or d.storage_path not like owner::text || '/files/' || d.id::text || '/%'
    then raise exception 'ocr_source_changed'; end if;
  if d.file_size not between 1 and 20971520 then raise exception 'ocr_too_large'; end if;
  if not (d.mime_type in ('application/pdf','image/png','image/jpeg','image/webp') or lower(d.original_filename) ~ '\.(pdf|png|jpe?g|webp)$')
    then raise exception 'ocr_invalid_image'; end if;
  if exists(select 1 from public.document_ocr_jobs where user_id=owner and status='processing' and lease_expires_at>now())
    then raise exception 'ocr_busy'; end if;
  return query insert into public.document_ocr_jobs(document_id,user_id,source_path,source_bucket,source_checksum,source_size,status,lease_expires_at)
    values(d.id,owner,d.storage_path,d.storage_bucket,d.checksum,d.file_size,'processing',now()+interval '6 minutes')
    on conflict(document_id) do update set source_path=excluded.source_path,source_bucket=excluded.source_bucket,
      source_checksum=excluded.source_checksum,source_size=excluded.source_size,status='processing',
      run_token=gen_random_uuid(),lease_expires_at=excluded.lease_expires_at,pages_completed=0,page_count=null,empty_pages=0,
      error_code=null,source_sha256=null,updated_at=now(),archived_at=null returning *;
end $$;

create function public.update_document_ocr(p_document_id uuid,p_run_token uuid,p_action text,
  p_pages integer default 0,p_total integer default null,p_text text default null,p_sha256 text default null,p_error text default null,p_empty_pages integer default 0)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.documents; j public.document_ocr_jobs; owner uuid := auth.uid();
begin
  if owner is null then return false; end if;
  -- Lock ordering is documents then job in all paths, including invalidation.
  select * into d from public.documents where id=p_document_id and user_id=owner for update;
  if not found then return false; end if;
  select * into j from public.document_ocr_jobs where document_id=d.id and user_id=owner for update;
  if not found or j.run_token<>p_run_token or j.status<>'processing' or j.lease_expires_at<=now() then return false; end if;
  if d.archived_at is not null or d.storage_state<>'available' or d.storage_provider<>'cloudflare_r2'
    or d.storage_path<>j.source_path or d.storage_bucket<>j.source_bucket or d.file_size<>j.source_size
    or d.checksum is distinct from j.source_checksum then return false; end if;
  if p_action='progress' then
    if p_total is null or p_total not between 1 and 10 or p_pages not between 0 and p_total or p_pages<j.pages_completed then return false; end if;
    update public.document_ocr_jobs set pages_completed=p_pages,page_count=p_total,updated_at=now() where document_id=d.id;
  elsif p_action='complete' then
    if p_text is null or length(btrim(p_text))=0 or length(p_text)>300000 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
      or (d.checksum is not null and d.checksum<>p_sha256) or p_total is null or p_total not between 1 and 10 or p_pages<>p_total or p_empty_pages is null or p_empty_pages not between 0 and p_total then return false; end if;
    update public.documents set extracted_text=p_text,extracted_character_count=length(p_text),text_extraction_status='completed',
      text_extraction_error_code=null,text_extracted_at=now(),updated_at=now(),text_extraction_method='ocr_local',
      text_extraction_engine_version='tesseract.js@7.0.0;tesseract.js-core@7.0.0',
      text_extraction_model_version='chi_sim@1.0.0+eng@1.0.0:4.0.0_best_int',
      text_extraction_source_sha256=p_sha256,text_extraction_page_count=p_total,text_extraction_empty_pages=p_empty_pages where id=d.id and user_id=owner;
    update public.document_ocr_jobs set status='completed',source_sha256=p_sha256,pages_completed=p_pages,page_count=p_total,empty_pages=p_empty_pages,updated_at=now() where document_id=d.id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
      values(owner,'file_ocr_completed','document',d.id,'user',jsonb_build_object('character_count',length(p_text),'pages',p_total,'empty_pages',p_empty_pages,'engine',j.engine_version));
  elsif p_action in ('cancel','fail') then
    update public.document_ocr_jobs set status=case when p_action='cancel' then 'cancelled' else 'failed' end,
      error_code=case when p_error in ('ocr_cancelled','ocr_timeout','ocr_too_many_pages','ocr_image_too_large','ocr_invalid_image','ocr_no_text','ocr_too_much_text','ocr_source_changed','ocr_encrypted') then p_error else 'ocr_failed' end,
      updated_at=now() where document_id=d.id;
  else return false;
  end if;
  return true;
end $$;
revoke all on function public.start_document_ocr(uuid) from public, anon;
revoke all on function public.update_document_ocr(uuid,uuid,text,integer,integer,text,text,text,integer) from public, anon;
grant execute on function public.start_document_ocr(uuid) to authenticated;
grant execute on function public.update_document_ocr(uuid,uuid,text,integer,integer,text,text,text,integer) to authenticated;

-- Source changes invalidate both the derived text/search index and OCR state.
-- Metadata edits and successful OCR publishing leave the fingerprint unchanged.
create function public.invalidate_document_derived_text() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (old.storage_path,old.storage_bucket,old.checksum,old.file_size,old.user_id,old.storage_provider)
    is distinct from (new.storage_path,new.storage_bucket,new.checksum,new.file_size,new.user_id,new.storage_provider) then
    new.extracted_text:=null; new.extracted_character_count:=0; new.text_extracted_at:=null;
    new.text_extraction_status:='not_requested'; new.text_extraction_error_code:=null;
    new.text_extraction_method:=null; new.text_extraction_engine_version:=null; new.text_extraction_model_version:=null;
    new.text_extraction_source_sha256:=null; new.text_extraction_page_count:=null; new.text_extraction_empty_pages:=null;
    delete from public.document_ocr_jobs where document_id=old.id;
  elsif new.archived_at is not null or new.storage_state<>'available' then
    update public.document_ocr_jobs set status='cancelled',error_code='ocr_source_changed',archived_at=now(),updated_at=now()
      where document_id=old.id and status='processing';
  end if;
  return new;
end $$;
revoke all on function public.invalidate_document_derived_text() from public, anon, authenticated;
create trigger documents_invalidate_derived_text before update on public.documents
  for each row execute function public.invalidate_document_derived_text();
