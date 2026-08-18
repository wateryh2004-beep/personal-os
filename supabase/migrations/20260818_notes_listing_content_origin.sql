-- Notes 列表返回 content_origin，供列表页区分「AI 生成」文档（门头门脸视觉）。
-- 与 fallback 直查路径（queries.ts select 已含 content_origin）保持一致；
-- 旧列表在未应用本迁移前仍可用（前端 schema 对该列做了 optional 容错）。
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
    left(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              coalesce(note.body_markdown, ''),
              '!\[[^]]*\]\([^)]*\)',
              '',
              'g'
            ),
            '[#*_>`~\[\]()]',
            ' ',
            'g'
          ),
          E'\\s+',
          ' ',
          'g'
        )
      ),
      220
    ) as excerpt,
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
