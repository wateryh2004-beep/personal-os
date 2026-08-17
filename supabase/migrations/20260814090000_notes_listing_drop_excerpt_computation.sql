-- Browsing the Notes library only needs metadata (id/title/updated_at/folder).
-- Previously the listing computed a 220-char excerpt on every row by running
-- three regexp_replace passes over the full body_markdown — work the list UI
-- never displays. Excerpt is now always null from this RPC; search
-- (searchNotesWorkspace) and wiki-link previews derive their own snippets from
-- body_markdown on demand, so AI and search results keep their context.
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
  folder_id uuid
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
    note.folder_id
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
  'Owner-scoped lightweight Notes listing; excerpt is always null because browsing does not display it.';
