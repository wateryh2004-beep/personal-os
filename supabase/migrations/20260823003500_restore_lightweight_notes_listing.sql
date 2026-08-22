-- The Notes navigator renders metadata only. A later migration that added
-- content_origin accidentally restored three regexp_replace passes over every
-- full body_markdown, regressing the lightweight listing introduced on
-- 2026-08-14. Keep the stable RPC shape, but return excerpt as null again.
create or replace function public.list_notes_workspace(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  excerpt text,
  updated_at timestamptz,
  pinned_at timestamptz,
  folder_id uuid,
  content_origin text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    note.id,
    note.title,
    null::text as excerpt,
    note.updated_at,
    note.pinned_at,
    note.folder_id,
    note.content_origin
  from public.notes as note
  where note.user_id = (select auth.uid())
    and note.deleted_at is null
    and note.status <> 'archived'
  order by note.pinned_at desc nulls last, note.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_notes_workspace(integer, integer)
from public, anon;
grant execute on function public.list_notes_workspace(integer, integer)
to authenticated;

comment on function public.list_notes_workspace(integer, integer) is
  'Owner-scoped lightweight Notes navigator listing; excerpt is intentionally null and content_origin is retained.';

-- These high-frequency policies previously used the InitPlan form, but later
-- schema changes left production with direct auth.uid() calls again. The
-- subquery is semantically identical and lets Postgres evaluate auth.uid() once
-- per statement instead of once per scanned row.
alter policy "notes_select_own" on public.notes
  using (user_id = (select auth.uid()));
alter policy "notes_insert_own" on public.notes
  with check (user_id = (select auth.uid()));
alter policy "notes_update_own" on public.notes
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "notes_delete_own" on public.notes
  using (user_id = (select auth.uid()));

alter policy "profiles_select_own" on public.profiles
  using (user_id = (select auth.uid()));
alter policy "profiles_insert_own" on public.profiles
  with check (user_id = (select auth.uid()));
alter policy "profiles_update_own" on public.profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "profiles_delete_own" on public.profiles
  using (user_id = (select auth.uid()));
