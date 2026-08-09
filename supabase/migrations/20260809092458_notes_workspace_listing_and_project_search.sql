-- Keep the Notes library payload bounded while preserving body_markdown as the
-- authoritative editor content. This function runs with the caller's RLS.
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
  'Owner-scoped lightweight Notes listing; never returns body_markdown.';

-- Reviews are already an application search domain. Include them while adding
-- Projects so the database constraint matches the complete search contract.
alter table public.search_documents
  drop constraint if exists search_documents_domain_check;

alter table public.search_documents
  add constraint search_documents_domain_check
  check (domain in (
    'notes',
    'career',
    'files',
    'tasks',
    'calendar',
    'reviews',
    'projects'
  ));

create or replace function public.sync_project_search_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_documents
    where user_id = old.user_id
      and entity_type = 'project'
      and entity_id = old.id;
    return old;
  end if;

  if new.archived_at is not null then
    delete from public.search_documents
    where user_id = new.user_id
      and entity_type = 'project'
      and entity_id = new.id;
    return new;
  end if;

  insert into public.search_documents (
    user_id,
    domain,
    entity_type,
    entity_id,
    title,
    subtitle,
    content_text,
    metadata,
    source_updated_at
  ) values (
    new.user_id,
    'projects',
    'project',
    new.id,
    new.name,
    concat_ws(' · ', new.status::text, new.due_date::text),
    coalesce(new.description, ''),
    jsonb_build_object(
      'source_table', 'projects',
      'status', new.status,
      'due_date', new.due_date,
      'area_id', new.area_id
    ),
    new.updated_at
  )
  on conflict (user_id, entity_type, entity_id) do update set
    domain = excluded.domain,
    title = excluded.title,
    subtitle = excluded.subtitle,
    content_text = excluded.content_text,
    metadata = excluded.metadata,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_project_search_document()
from public, anon;

drop trigger if exists projects_search_sync on public.projects;
create trigger projects_search_sync
after insert or update or delete on public.projects
for each row execute procedure public.sync_project_search_document();

insert into public.search_documents (
  user_id,
  domain,
  entity_type,
  entity_id,
  title,
  subtitle,
  content_text,
  metadata,
  source_updated_at
)
select
  project.user_id,
  'projects',
  'project',
  project.id,
  project.name,
  concat_ws(' · ', project.status::text, project.due_date::text),
  coalesce(project.description, ''),
  jsonb_build_object(
    'source_table', 'projects',
    'status', project.status,
    'due_date', project.due_date,
    'area_id', project.area_id
  ),
  project.updated_at
from public.projects as project
where project.archived_at is null
on conflict (user_id, entity_type, entity_id) do update set
  domain = excluded.domain,
  title = excluded.title,
  subtitle = excluded.subtitle,
  content_text = excluded.content_text,
  metadata = excluded.metadata,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();
