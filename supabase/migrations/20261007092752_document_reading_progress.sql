-- Reading position is source-versioned user data. No file bytes or covers change.
alter table public.documents add column reading_source_version uuid not null default gen_random_uuid();
create function public.refresh_document_reading_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.storage_path,new.storage_bucket,new.storage_provider,new.checksum,new.file_size,new.mime_type)
    is distinct from row(old.storage_path,old.storage_bucket,old.storage_provider,old.checksum,old.file_size,old.mime_type) then
    new.reading_source_version := gen_random_uuid();
  else
    new.reading_source_version := old.reading_source_version;
  end if;
  return new;
end; $$;
create trigger refresh_document_reading_source before update on public.documents
for each row execute function public.refresh_document_reading_source();
revoke all on function public.refresh_document_reading_source() from public,anon,authenticated;

create table public.document_reading_progress (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_version uuid not null,
  page integer not null check (page between 1 and 500),
  total_pages integer not null check (total_pages between 1 and 500 and page <= total_pages),
  revision bigint not null check (revision between 1 and 9007199254740990),
  last_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_reading_progress_user_idx on public.document_reading_progress(user_id,updated_at desc);
alter table public.document_reading_progress enable row level security;
alter table public.document_reading_progress force row level security;
revoke all on public.document_reading_progress from public,anon,authenticated;
grant select,insert,update on public.document_reading_progress to authenticated;
grant all on public.document_reading_progress to service_role;
create policy reading_progress_select on public.document_reading_progress for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid())));
create policy reading_progress_insert on public.document_reading_progress for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid()) and d.reading_source_version=source_version and d.archived_at is null and d.storage_state='available'));
create policy reading_progress_update on public.document_reading_progress for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()) and exists (select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid()) and d.reading_source_version=source_version and d.archived_at is null and d.storage_state='available'));

create function public.save_document_reading_progress(p_document_id uuid,p_source_version uuid,p_page integer,p_total_pages integer,p_expected_revision bigint,p_mutation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare d public.documents; p public.document_reading_progress; current_revision bigint := 0; result_status text := 'saved';
begin
  if auth.uid() is null or p_page is null or p_total_pages is null or p_expected_revision is null or p_mutation_id is null
    or p_page < 1 or p_page > p_total_pages or p_total_pages > 500 or p_expected_revision < 0 or p_expected_revision >= 9007199254740990 then
    raise exception 'invalid reading progress' using errcode='22023';
  end if;
  -- Lock the parent first, including the first insert: separate devices serialize.
  select * into d from public.documents where id=p_document_id and user_id=auth.uid() for update;
  if not found or d.archived_at is not null or d.storage_state <> 'available' or d.storage_provider <> 'cloudflare_r2'
    or d.file_size > 26214400 or not (lower(d.mime_type)='application/pdf' or (lower(d.mime_type)='application/octet-stream' and lower(d.original_filename) like '%.pdf')) then
    return jsonb_build_object('status','unavailable');
  end if;
  if d.reading_source_version is distinct from p_source_version then return jsonb_build_object('status','source_changed'); end if;
  select * into p from public.document_reading_progress where document_id=p_document_id and user_id=auth.uid() for update;
  if found and p.source_version=p_source_version then current_revision := p.revision; end if;
  if current_revision > 0 and p.last_mutation_id=p_mutation_id and p.page=p_page and p.total_pages=p_total_pages then
    null; -- Idempotent retry after a lost response.
  elsif current_revision <> p_expected_revision then
    result_status := 'conflict';
  else
    insert into public.document_reading_progress(document_id,user_id,source_version,page,total_pages,revision,last_mutation_id)
      values(p_document_id,auth.uid(),p_source_version,p_page,p_total_pages,current_revision+1,p_mutation_id)
      on conflict(document_id) do update set source_version=excluded.source_version,page=excluded.page,total_pages=excluded.total_pages,
        revision=excluded.revision,last_mutation_id=excluded.last_mutation_id,updated_at=now()
      returning * into p;
  end if;
  return jsonb_build_object('status',result_status,'progress',jsonb_build_object('page',p.page,'totalPages',p.total_pages,'revision',p.revision,'updatedAt',p.updated_at));
end; $$;
revoke all on function public.save_document_reading_progress(uuid,uuid,integer,integer,bigint,uuid) from public,anon;
grant execute on function public.save_document_reading_progress(uuid,uuid,integer,integer,bigint,uuid) to authenticated;
