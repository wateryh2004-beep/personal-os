-- OCR corrections are append-only and apply only to the exact recognized source.
create table public.experience_library_ocr_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  media_id uuid not null references public.experience_library_media(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  text_content text not null check (char_length(text_content) <= 300000),
  created_at timestamptz not null default now()
);
create index experience_ocr_corrections_latest on public.experience_library_ocr_corrections (user_id, media_id, created_at desc, id desc);
alter table public.experience_library_ocr_corrections enable row level security;
alter table public.experience_library_ocr_corrections force row level security;
create policy experience_ocr_corrections_read on public.experience_library_ocr_corrections for select to authenticated using (user_id=(select auth.uid()));
create policy experience_ocr_corrections_insert on public.experience_library_ocr_corrections for insert to authenticated with check (
  user_id=(select auth.uid()) and exists (
    select 1 from public.experience_library_media m join public.documents d on d.id=m.document_id and d.user_id=m.user_id
    where m.id=experience_library_ocr_corrections.media_id and m.user_id=(select auth.uid()) and m.document_id=experience_library_ocr_corrections.document_id and m.archived_at is null
      and d.archived_at is null and d.storage_state='available' and d.text_extraction_method='ocr_local'
      and d.text_extraction_source_sha256=experience_library_ocr_corrections.source_sha256
  )
);
revoke all on public.experience_library_ocr_corrections from public, anon, authenticated;
grant select, insert on public.experience_library_ocr_corrections to authenticated;

-- Serialize corrections for one image and reject stale editors. The original
-- OCR timestamp also changes when recognition is rerun on the same bytes.
create function public.save_experience_ocr_correction(p_media_id uuid, p_document_id uuid, p_source_sha256 text, p_text text, p_expected_correction uuid, p_expected_extracted_at timestamptz)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare owner uuid := (select auth.uid()); current_correction uuid; current_extracted_at timestamptz; saved_id uuid;
begin
  if owner is null or p_text is null or char_length(p_text)>300000 then raise exception 'invalid_correction'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_media_id::text, 0));
  select d.text_extracted_at into current_extracted_at
  from public.experience_library_media m join public.documents d on d.id=m.document_id and d.user_id=m.user_id
  where m.id=p_media_id and m.user_id=owner and m.document_id=p_document_id and m.archived_at is null
    and d.archived_at is null and d.storage_state='available' and d.text_extraction_method='ocr_local' and d.text_extraction_source_sha256=p_source_sha256 for share of d;
  if not found or current_extracted_at is distinct from p_expected_extracted_at then raise exception 'ocr_source_changed'; end if;
  select c.id into current_correction from public.experience_library_ocr_corrections c
  where c.user_id=owner and c.media_id=p_media_id and c.document_id=p_document_id and c.source_sha256=p_source_sha256
  order by c.created_at desc,c.id desc limit 1;
  if current_correction is distinct from p_expected_correction then raise exception 'ocr_correction_conflict'; end if;
  insert into public.experience_library_ocr_corrections(user_id,media_id,document_id,source_sha256,text_content)
  values(owner,p_media_id,p_document_id,p_source_sha256,p_text) returning id into saved_id;
  return saved_id;
end;
$$;
revoke all on function public.save_experience_ocr_correction(uuid,uuid,text,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.save_experience_ocr_correction(uuid,uuid,text,text,uuid,timestamptz) to authenticated;

create or replace function public.search_experience_library_v2(p_query text default '', p_tag text default '', p_status text default '', p_has_media boolean default false, p_analyzed boolean default false, p_sort text default 'updated')
returns table(id uuid, source_url text, title text, tags text[], ai_summary text, ai_status text, ai_error_code text, ai_provider text, ai_model text, ai_analyzed_at timestamptz, updated_at timestamptz, created_at timestamptz, capture_count bigint, media_count bigint, personal_note text, review_status text, match_excerpt text)
language sql stable security invoker set search_path = '' as $$
  with images as (
    select m.entry_id, m.created_at, coalesce((select c.text_content from public.experience_library_ocr_corrections c where c.user_id=(select auth.uid()) and c.media_id=m.id and c.document_id=d.id and c.source_sha256=d.text_extraction_source_sha256 order by c.created_at desc,c.id desc limit 1), d.extracted_text) as text_content
    from public.experience_library_media m join public.documents d on d.id=m.document_id and d.user_id=m.user_id
    where m.user_id=(select auth.uid()) and m.archived_at is null and d.archived_at is null and d.storage_state='available' and d.text_extraction_method='ocr_local'
  ), original_search as (
    select e.id, e.source_url, e.title, e.tags, e.ai_summary, e.ai_status, e.ai_error_code, e.ai_provider, e.ai_model, e.ai_analyzed_at, e.updated_at, e.created_at,
      (select count(*) from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid())) capture_count,
      (select count(*) from public.experience_library_media m where m.entry_id=e.id and m.user_id=(select auth.uid()) and m.archived_at is null) media_count,
      e.personal_note, e.review_status,
      (select substring(c.raw_content from greatest(1, position(lower(btrim(left(p_query,120))) in lower(c.raw_content))-40) for 160) from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid()) and btrim(coalesce(p_query,'')) <> '' and position(lower(btrim(left(p_query,120))) in lower(c.raw_content)) > 0 order by c.created_at limit 1) capture_excerpt,
      (select substring(i.text_content from greatest(1, position(lower(btrim(left(p_query,120))) in lower(i.text_content))-40) for 160) from images i where i.entry_id=e.id and btrim(coalesce(p_query,'')) <> '' and position(lower(btrim(left(p_query,120))) in lower(i.text_content)) > 0 order by i.created_at limit 1) image_excerpt
    from public.experience_library_entries e
    where e.user_id=(select auth.uid()) and e.archived_at is null
      and (coalesce(p_tag,'')='' or p_tag=any(e.tags)) and (coalesce(p_status,'')='' or e.review_status=p_status)
      and (not coalesce(p_has_media,false) or exists(select 1 from public.experience_library_media m where m.entry_id=e.id and m.user_id=(select auth.uid()) and m.archived_at is null))
      and (not coalesce(p_analyzed,false) or e.ai_status='completed')
      and (btrim(coalesce(p_query,''))='' or position(lower(btrim(left(p_query,120))) in lower(concat_ws(E'\n',e.title,e.ai_summary,e.personal_note,array_to_string(e.tags,' '), (select string_agg(c.raw_content,E'\n') from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid())))))>0
        or exists(select 1 from images i where i.entry_id=e.id and position(lower(btrim(left(p_query,120))) in lower(i.text_content))>0))
  )
  select o.id,o.source_url,o.title,o.tags,o.ai_summary,o.ai_status,o.ai_error_code,o.ai_provider,o.ai_model,o.ai_analyzed_at,o.updated_at,o.created_at,o.capture_count,o.media_count,o.personal_note,o.review_status,coalesce(o.capture_excerpt,case when o.image_excerpt is not null then '图片识别：' || o.image_excerpt end)
  from original_search o order by case when p_sort='created' then o.created_at else o.updated_at end desc,o.id limit 60;
$$;

-- A link supplements the provider-backed task; Microsoft To Do remains authoritative.
create table public.experience_library_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  todo_task_id uuid not null references public.microsoft_todo_tasks(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id,entry_id,todo_task_id)
);
alter table public.experience_library_task_links enable row level security;
alter table public.experience_library_task_links force row level security;
create policy experience_task_links_read on public.experience_library_task_links for select to authenticated using (user_id=(select auth.uid()));
create policy experience_task_links_insert on public.experience_library_task_links for insert to authenticated with check (
  user_id=(select auth.uid())
  and exists (select 1 from public.experience_library_entries e where e.id=experience_library_task_links.entry_id and e.user_id=(select auth.uid()) and e.archived_at is null)
  and exists (select 1 from public.microsoft_todo_tasks t where t.id=experience_library_task_links.todo_task_id and t.user_id=(select auth.uid()) and t.archived_at is null)
);
revoke all on public.experience_library_task_links from public, anon, authenticated;
grant select, insert on public.experience_library_task_links to authenticated;
