alter table public.experience_library_entries
  add column personal_note text not null default '' check (char_length(personal_note) <= 10000),
  add column review_status text not null default 'unmarked' check (review_status in ('unmarked','to_read','useful','outdated'));

create function public.search_experience_library_v2(p_query text default '', p_tag text default '', p_status text default '', p_has_media boolean default false, p_analyzed boolean default false, p_sort text default 'updated')
returns table(id uuid, source_url text, title text, tags text[], ai_summary text, ai_status text, ai_error_code text, ai_provider text, ai_model text, ai_analyzed_at timestamptz, updated_at timestamptz, created_at timestamptz, capture_count bigint, media_count bigint, personal_note text, review_status text, match_excerpt text)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.source_url, e.title, e.tags, e.ai_summary, e.ai_status, e.ai_error_code, e.ai_provider, e.ai_model, e.ai_analyzed_at, e.updated_at, e.created_at,
    (select count(*) from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid())),
    (select count(*) from public.experience_library_media m where m.entry_id=e.id and m.user_id=(select auth.uid()) and m.archived_at is null),
    e.personal_note, e.review_status,
    (select substring(c.raw_content from greatest(1, position(lower(btrim(left(p_query,120))) in lower(c.raw_content))-40) for 160) from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid()) and btrim(coalesce(p_query,'')) <> '' and position(lower(btrim(left(p_query,120))) in lower(c.raw_content)) > 0 order by c.created_at limit 1)
  from public.experience_library_entries e
  where e.user_id=(select auth.uid()) and e.archived_at is null
    and (coalesce(p_tag,'')='' or p_tag=any(e.tags))
    and (coalesce(p_status,'')='' or e.review_status=p_status)
    and (not coalesce(p_has_media,false) or exists(select 1 from public.experience_library_media m where m.entry_id=e.id and m.user_id=(select auth.uid()) and m.archived_at is null))
    and (not coalesce(p_analyzed,false) or e.ai_status='completed')
    and (btrim(coalesce(p_query,''))='' or position(lower(btrim(left(p_query,120))) in lower(concat_ws(E'\n',e.title,e.ai_summary,e.personal_note,array_to_string(e.tags,' '), (select string_agg(c.raw_content,E'\n') from public.experience_library_captures c where c.entry_id=e.id and c.user_id=(select auth.uid())))))>0)
  order by case when p_sort='created' then e.created_at else e.updated_at end desc, e.id limit 60;
$$;
revoke all on function public.search_experience_library_v2(text,text,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.search_experience_library_v2(text,text,text,boolean,boolean,text) to authenticated;
comment on column public.experience_library_entries.personal_note is 'Owner-authored notes, separate from source captures and AI conclusions.';

create table public.experience_library_note_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  personal_note text not null check (char_length(personal_note) <= 10000),
  review_status text not null check (review_status in ('unmarked','to_read','useful','outdated')),
  created_at timestamptz not null default now()
);
alter table public.experience_library_note_versions enable row level security;
alter table public.experience_library_note_versions force row level security;
create policy "experience_note_versions_select_own" on public.experience_library_note_versions for select to authenticated using (user_id = (select auth.uid()));
create policy "experience_note_versions_insert_own" on public.experience_library_note_versions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.experience_library_entries e where e.id=entry_id and e.user_id=(select auth.uid())));
revoke all on public.experience_library_note_versions from public, anon, authenticated;
grant select, insert on public.experience_library_note_versions to authenticated;
create function public.preserve_experience_note_version() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (old.personal_note, old.review_status) is distinct from (new.personal_note, new.review_status) and (old.personal_note <> '' or old.review_status <> 'unmarked') then
    insert into public.experience_library_note_versions (entry_id,user_id,personal_note,review_status) values (old.id,old.user_id,old.personal_note,old.review_status);
  end if;
  return new;
end;
$$;
create trigger experience_preserve_note before update of personal_note, review_status on public.experience_library_entries for each row execute function public.preserve_experience_note_version();
