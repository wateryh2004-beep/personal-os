-- Keep originals and linked images in their original rows. A merge is a reversible grouping.
alter table public.experience_library_entries
  add column merged_into_id uuid references public.experience_library_entries(id) on delete restrict,
  add column reviewed_at timestamptz,
  add constraint experience_no_self_merge check (merged_into_id is null or merged_into_id <> id);
create index experience_library_group_children on public.experience_library_entries(user_id,merged_into_id) where merged_into_id is not null;

create function public.validate_experience_library_merge() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.merged_into_id is not null then
    if not exists(select 1 from public.experience_library_entries root where root.id=new.merged_into_id and root.user_id=new.user_id and root.merged_into_id is null and root.archived_at is null)
      or exists(select 1 from public.experience_library_entries child where child.user_id=new.user_id and child.merged_into_id=new.id)
      then raise exception 'invalid_merge_target'; end if;
  end if;
  return new;
end; $$;
create trigger experience_merge_validate before update of merged_into_id on public.experience_library_entries
  for each row when (old.merged_into_id is distinct from new.merged_into_id) execute function public.validate_experience_library_merge();

create function public.audit_experience_library_merge() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(new.user_id,case when new.merged_into_id is null then 'unmerge' else 'merge' end,'experience_library_entry',coalesce(new.merged_into_id,old.merged_into_id),
      case when (select auth.uid()) is null then 'system' else 'user' end,pg_catalog.jsonb_build_object('source_entry_id',new.id));
  return new;
end; $$;
create trigger experience_merge_audit after update of merged_into_id on public.experience_library_entries
  for each row when (old.merged_into_id is distinct from new.merged_into_id) execute function public.audit_experience_library_merge();

create function public.set_experience_library_merge(p_source uuid,p_target uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare owner uuid := (select auth.uid()); source_row public.experience_library_entries; target_row public.experience_library_entries;
begin
  if owner is null or p_source is null or p_target is null or p_source=p_target then raise exception 'invalid_merge'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,913));
  select * into source_row from public.experience_library_entries where id=p_source and user_id=owner and archived_at is null for update;
  select * into target_row from public.experience_library_entries where id=p_target and user_id=owner and archived_at is null for update;
  if source_row.id is null or target_row.id is null or target_row.merged_into_id is not null or source_row.id=target_row.id then raise exception 'merge_target_changed'; end if;
  if source_row.merged_into_id is distinct from p_target and source_row.merged_into_id is not null then raise exception 'merge_source_changed'; end if;
  if exists(select 1 from public.experience_library_entries child where child.user_id=owner and child.merged_into_id=p_source) then raise exception 'merge_source_has_children'; end if;
  update public.experience_library_entries set merged_into_id=p_target where id=p_source and user_id=owner;
  update public.experience_library_entries set updated_at=now() where id=p_target and user_id=owner;
  return p_target;
end; $$;
revoke all on function public.set_experience_library_merge(uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_experience_library_merge(uuid,uuid) to authenticated;

create function public.undo_experience_library_merge(p_source uuid,p_expected_target uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare owner uuid := (select auth.uid());
begin
  if owner is null or p_source is null or p_expected_target is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,913));
  update public.experience_library_entries set merged_into_id=null where id=p_source and user_id=owner and merged_into_id=p_expected_target and archived_at is null;
  if not found then return false; end if;
  update public.experience_library_entries set updated_at=now() where id=p_expected_target and user_id=owner;
  return true;
end; $$;
revoke all on function public.undo_experience_library_merge(uuid,uuid) from public,anon,authenticated;
grant execute on function public.undo_experience_library_merge(uuid,uuid) to authenticated;

create table public.experience_library_action_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  todo_task_id uuid not null references public.microsoft_todo_tasks(id) on delete restrict,
  request_id uuid not null,
  unique(user_id,request_id),
  verdict text not null check (verdict in ('effective','partly','not_effective','not_tried')),
  note text not null check (char_length(note) <= 5000),
  created_at timestamptz not null default now()
);
create index experience_action_reviews_recent on public.experience_library_action_reviews(user_id,entry_id,todo_task_id,created_at desc,id desc);
alter table public.experience_library_action_reviews enable row level security;
alter table public.experience_library_action_reviews force row level security;
create policy experience_action_reviews_read on public.experience_library_action_reviews for select to authenticated using (user_id=(select auth.uid()));
create policy experience_action_reviews_insert on public.experience_library_action_reviews for insert to authenticated with check (
  user_id=(select auth.uid()) and exists (select 1 from public.experience_library_task_links link where link.user_id=(select auth.uid()) and link.entry_id=experience_library_action_reviews.entry_id and link.todo_task_id=experience_library_action_reviews.todo_task_id)
);
revoke all on public.experience_library_action_reviews from public,anon,authenticated;
grant select,insert on public.experience_library_action_reviews to authenticated;

create function public.mark_experience_library_reviewed(p_entry uuid)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare owner uuid := (select auth.uid()); moment timestamptz := now();
begin
  if owner is null then raise exception 'review_unauthorized'; end if;
  update public.experience_library_entries set reviewed_at=moment where id=p_entry and user_id=owner and archived_at is null and merged_into_id is null;
  if not found then raise exception 'entry_unavailable'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(owner,'reviewed','experience_library_entry',p_entry,'user',pg_catalog.jsonb_build_object('reviewed_at',moment));
  return moment;
end; $$;
revoke all on function public.mark_experience_library_reviewed(uuid) from public,anon,authenticated;
grant execute on function public.mark_experience_library_reviewed(uuid) to authenticated;

create function public.record_experience_action_review(p_entry uuid,p_task uuid,p_request uuid,p_verdict text,p_note text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare owner uuid := (select auth.uid()); existing public.experience_library_action_reviews; saved uuid;
begin
  if owner is null or p_request is null or p_verdict not in ('effective','partly','not_effective','not_tried') or p_note is null or char_length(p_note)>5000 then raise exception 'invalid_review'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||p_request::text,921));
  select * into existing from public.experience_library_action_reviews where user_id=owner and request_id=p_request;
  if found then
    if (existing.entry_id,existing.todo_task_id,existing.verdict,existing.note) is distinct from (p_entry,p_task,p_verdict,p_note) then raise exception 'request_reused'; end if;
    return existing.id;
  end if;
  insert into public.experience_library_action_reviews(user_id,entry_id,todo_task_id,request_id,verdict,note)
    values(owner,p_entry,p_task,p_request,p_verdict,p_note) returning id into saved;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
    values(owner,'action_review','experience_library_entry',p_entry,'user',pg_catalog.jsonb_build_object('task_id',p_task,'verdict',p_verdict));
  return saved;
end; $$;
revoke all on function public.record_experience_action_review(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_experience_action_review(uuid,uuid,uuid,text,text) to authenticated;

create function public.search_experience_library_v3(p_query text default '',p_tag text default '',p_status text default '',p_has_media boolean default false,p_analyzed boolean default false,p_sort text default 'updated',p_offset integer default 0)
returns table(id uuid,source_url text,title text,tags text[],ai_summary text,ai_status text,ai_error_code text,ai_provider text,ai_model text,ai_analyzed_at timestamptz,updated_at timestamptz,created_at timestamptz,capture_count bigint,media_count bigint,personal_note text,review_status text,match_excerpt text,reviewed_at timestamptz,merged_count bigint)
language sql stable security invoker set search_path='' as $$
  with roots as (
    select e.*,array(select child.id from public.experience_library_entries child where child.user_id=(select auth.uid()) and child.archived_at is null and (child.id=e.id or child.merged_into_id=e.id)) as group_ids
    from public.experience_library_entries e where e.user_id=(select auth.uid()) and e.archived_at is null and e.merged_into_id is null
  ), image_text as (
    select m.entry_id, coalesce((select c.text_content from public.experience_library_ocr_corrections c where c.user_id=(select auth.uid()) and c.media_id=m.id and c.document_id=d.id and c.source_sha256=d.text_extraction_source_sha256 order by c.created_at desc,c.id desc limit 1),d.extracted_text) as content
    from public.experience_library_media m join public.documents d on d.id=m.document_id and d.user_id=m.user_id
    where m.user_id=(select auth.uid()) and m.archived_at is null and d.archived_at is null and d.storage_state='available' and d.text_extraction_method='ocr_local'
  )
  select e.id,e.source_url,e.title,
    coalesce((select array_agg(distinct tag) from public.experience_library_entries member cross join lateral unnest(member.tags) tag where member.id=any(e.group_ids) and member.user_id=(select auth.uid())),'{}'::text[]),e.ai_summary,e.ai_status,e.ai_error_code,e.ai_provider,e.ai_model,e.ai_analyzed_at,e.updated_at,e.created_at,
    (select count(*) from public.experience_library_captures c where c.user_id=(select auth.uid()) and c.entry_id=any(e.group_ids)),
    (select count(*) from public.experience_library_media m where m.user_id=(select auth.uid()) and m.entry_id=any(e.group_ids) and m.archived_at is null),
    e.personal_note,e.review_status,
    coalesce((select substring(c.raw_content from greatest(1,position(lower(btrim(left(p_query,120))) in lower(c.raw_content))-40) for 160) from public.experience_library_captures c where c.user_id=(select auth.uid()) and c.entry_id=any(e.group_ids) and btrim(coalesce(p_query,''))<>'' and position(lower(btrim(left(p_query,120))) in lower(c.raw_content))>0 order by c.created_at limit 1),
      (select '图片识别：'||substring(i.content from greatest(1,position(lower(btrim(left(p_query,120))) in lower(i.content))-40) for 160) from image_text i where i.entry_id=any(e.group_ids) and btrim(coalesce(p_query,''))<>'' and position(lower(btrim(left(p_query,120))) in lower(i.content))>0 limit 1)),
    e.reviewed_at,cardinality(e.group_ids)-1::bigint
  from roots e
  where (coalesce(p_tag,'')='' or exists(select 1 from public.experience_library_entries child where child.id=any(e.group_ids) and child.user_id=(select auth.uid()) and p_tag=any(child.tags)))
    and (coalesce(p_status,'')='' or e.review_status=p_status)
    and (not coalesce(p_has_media,false) or exists(select 1 from public.experience_library_media m where m.user_id=(select auth.uid()) and m.entry_id=any(e.group_ids) and m.archived_at is null))
    and (not coalesce(p_analyzed,false) or e.ai_status='completed')
    and (btrim(coalesce(p_query,''))='' or position(lower(btrim(left(p_query,120))) in lower(concat_ws(E'\n',e.title,e.ai_summary,e.personal_note,array_to_string(e.tags,' '),
      (select string_agg(c.raw_content,E'\n') from public.experience_library_captures c where c.user_id=(select auth.uid()) and c.entry_id=any(e.group_ids)),
      (select string_agg(concat_ws(' ',member.title,member.ai_summary,member.personal_note,array_to_string(member.tags,' ')),E'\n') from public.experience_library_entries member where member.user_id=(select auth.uid()) and member.id=any(e.group_ids)))))>0
      or exists(select 1 from image_text i where i.entry_id=any(e.group_ids) and position(lower(btrim(left(p_query,120))) in lower(i.content))>0))
  order by case when p_sort='created' then e.created_at else e.updated_at end desc,e.id
  limit 21 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
revoke all on function public.search_experience_library_v3(text,text,text,boolean,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.search_experience_library_v3(text,text,text,boolean,boolean,text,integer) to authenticated;
