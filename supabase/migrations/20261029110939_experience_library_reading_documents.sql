-- Curated reading documents are derived from immutable captures and linked OCR.
create table public.experience_library_reading_documents (
  capture_id uuid primary key references public.experience_library_captures(id) on delete restrict,
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  body_markdown text not null check (char_length(btrim(body_markdown)) between 1 and 20000),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs) between 1 and 40),
  quality_status text not null default 'keep' check (quality_status in ('keep','pending_delete')),
  quality_reason text not null default '' check (char_length(quality_reason)<=1000),
  coverage_status text not null default 'complete' check (coverage_status in ('complete','partial')),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quality_status<>'pending_delete' or char_length(btrim(quality_reason))>0)
);
create index experience_reading_documents_entry on public.experience_library_reading_documents(user_id,entry_id);
alter table public.experience_library_reading_documents enable row level security;
alter table public.experience_library_reading_documents force row level security;
create policy experience_reading_documents_select on public.experience_library_reading_documents for select to authenticated using(user_id=(select auth.uid()));
create policy experience_reading_documents_insert on public.experience_library_reading_documents for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.experience_library_captures c where c.id=capture_id and c.entry_id=experience_library_reading_documents.entry_id and c.user_id=(select auth.uid())));
create policy experience_reading_documents_update on public.experience_library_reading_documents for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.experience_library_captures c where c.id=capture_id and c.entry_id=experience_library_reading_documents.entry_id and c.user_id=(select auth.uid())));
revoke all on public.experience_library_reading_documents from public,anon,authenticated;
grant select,insert,update on public.experience_library_reading_documents to authenticated;

create table public.experience_library_reading_versions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.experience_library_reading_documents(capture_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check(revision>0),
  title text not null,
  body_markdown text not null,
  source_refs jsonb not null,
  quality_status text not null,
  quality_reason text not null,
  coverage_status text not null,
  created_at timestamptz not null default now(),
  unique(user_id,capture_id,revision)
);
alter table public.experience_library_reading_versions enable row level security;
alter table public.experience_library_reading_versions force row level security;
create policy experience_reading_versions_select on public.experience_library_reading_versions for select to authenticated using(user_id=(select auth.uid()));
create policy experience_reading_versions_insert on public.experience_library_reading_versions for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.experience_library_reading_documents d where d.capture_id=experience_library_reading_versions.capture_id and d.user_id=(select auth.uid())));
revoke all on public.experience_library_reading_versions from public,anon,authenticated;
grant select,insert on public.experience_library_reading_versions to authenticated;

create function public.preserve_experience_reading_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (old.user_id,old.entry_id,old.capture_id) is distinct from (new.user_id,new.entry_id,new.capture_id) then raise exception 'reading_identity_immutable'; end if;
  if new.revision<>old.revision+1 then raise exception 'reading_revision_conflict'; end if;
  insert into public.experience_library_reading_versions(capture_id,user_id,revision,title,body_markdown,source_refs,quality_status,quality_reason,coverage_status)
  values(old.capture_id,old.user_id,old.revision,old.title,old.body_markdown,old.source_refs,old.quality_status,old.quality_reason,old.coverage_status);
  new.updated_at=now(); return new;
end; $$;
create trigger experience_reading_version before update on public.experience_library_reading_documents for each row execute function public.preserve_experience_reading_version();

create function public.save_experience_library_reading_document(p_capture uuid,p_title text,p_body text,p_refs jsonb,p_status text,p_reason text,p_coverage text,p_expected_revision integer)
returns integer language plpgsql security invoker set search_path='' as $$
declare owner uuid := (select auth.uid()); original public.experience_library_captures; current_doc public.experience_library_reading_documents; ref jsonb; quote text; ref_id uuid; source_text text;
begin
  if owner is null or p_title is null or char_length(btrim(p_title)) not between 1 and 240 or p_body is null or char_length(btrim(p_body)) not between 1 and 20000
    or p_status not in ('keep','pending_delete') or p_reason is null or char_length(p_reason)>1000 or (p_status='pending_delete' and char_length(btrim(p_reason))=0)
    or p_coverage not in ('complete','partial') or p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_refs)<>'array' or jsonb_array_length(p_refs) not between 1 and 40
    then raise exception 'invalid_reading_document'; end if;
  select * into original from public.experience_library_captures where id=p_capture and user_id=owner;
  if not found then raise exception 'source_unavailable'; end if;
  for ref in select value from jsonb_array_elements(p_refs) loop
    quote := ref->>'quote';
    begin ref_id := (ref->>'id')::uuid; exception when others then raise exception 'invalid_source_reference'; end;
    if quote is null or char_length(btrim(quote))=0 or char_length(quote)>500 then raise exception 'invalid_source_quote'; end if;
    if ref->>'type'='capture' then
      if ref_id<>p_capture or position(quote in original.raw_content)=0 then raise exception 'invalid_capture_quote'; end if;
    elsif ref->>'type'='image' then
      select coalesce((select correction.text_content from public.experience_library_ocr_corrections correction where correction.user_id=owner and correction.media_id=media.id and correction.document_id=doc.id and correction.source_sha256=doc.text_extraction_source_sha256 order by correction.created_at desc,correction.id desc limit 1),doc.extracted_text)
      into source_text from public.experience_library_media media join public.documents doc on doc.id=media.document_id and doc.user_id=media.user_id
      where media.id=ref_id and media.entry_id=original.entry_id and media.user_id=owner and media.archived_at is null and doc.archived_at is null and doc.storage_state='available' and doc.text_extraction_method='ocr_local';
      if source_text is null or position(quote in source_text)=0 then raise exception 'invalid_image_quote'; end if;
    else raise exception 'invalid_source_type'; end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_capture::text,1277));
  select * into current_doc from public.experience_library_reading_documents where capture_id=p_capture and user_id=owner for update;
  if not found then
    if p_expected_revision<>0 then raise exception 'reading_revision_conflict'; end if;
    insert into public.experience_library_reading_documents(capture_id,entry_id,user_id,title,body_markdown,source_refs,quality_status,quality_reason,coverage_status)
      values(p_capture,original.entry_id,owner,p_title,p_body,p_refs,p_status,p_reason,p_coverage);
    insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner,'reading_document_created','experience_library_entry',original.entry_id,'user',pg_catalog.jsonb_build_object('capture_id',p_capture,'quality_status',p_status));
    return 1;
  end if;
  if current_doc.revision<>p_expected_revision then raise exception 'reading_revision_conflict'; end if;
  update public.experience_library_reading_documents set title=p_title,body_markdown=p_body,source_refs=p_refs,quality_status=p_status,quality_reason=p_reason,coverage_status=p_coverage,revision=revision+1 where capture_id=p_capture and user_id=owner;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner,'reading_document_updated','experience_library_entry',original.entry_id,'user',pg_catalog.jsonb_build_object('capture_id',p_capture,'quality_status',p_status,'revision',p_expected_revision+1));
  return p_expected_revision+1;
end; $$;
revoke all on function public.save_experience_library_reading_document(uuid,text,text,jsonb,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_experience_library_reading_document(uuid,text,text,jsonb,text,text,text,integer) to authenticated;
