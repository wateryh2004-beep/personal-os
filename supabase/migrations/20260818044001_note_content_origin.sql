-- A note's source is separate from its Markdown: copied AI output remains
-- available to Hang Yu, but is excluded from AI background retrieval.
alter table public.notes
  add column if not exists content_origin text not null default 'human'
    check (content_origin in ('human', 'ai_generated'));

create index if not exists notes_human_context_idx
  on public.notes (user_id, updated_at desc)
  where content_origin = 'human'
    and deleted_at is null
    and archived_at is null
    and status = 'active';

comment on column public.notes.content_origin is
  'Human-authored by default. AI-generated notes are retained for browsing but omitted from AI background retrieval.';
