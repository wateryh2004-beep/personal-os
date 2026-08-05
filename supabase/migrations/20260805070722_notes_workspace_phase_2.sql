-- Notes Workspace Phase 2. Markdown remains authoritative in public.notes.
alter type public.note_status add value if not exists 'trashed';

alter table public.notes
  add column if not exists folder_id uuid,
  add column if not exists revision integer not null default 0 check (revision >= 0),
  add column if not exists content_hash text,
  add column if not exists word_count integer not null default 0 check (word_count >= 0),
  add column if not exists character_count integer not null default 0 check (character_count >= 0),
  add column if not exists last_saved_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table public.note_folders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.note_folders(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120), position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
alter table public.notes add constraint notes_folder_id_fkey foreign key (folder_id) references public.note_folders(id) on delete set null;

create table public.tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), color text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (user_id, name)
);
create table public.note_tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade, tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (note_id, tag_id)
);
create table public.note_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_note_id uuid not null references public.notes(id) on delete cascade,
  target_note_id uuid references public.notes(id) on delete set null,
  target_title text not null, alias text, link_type text not null check (link_type in ('wiki', 'markdown', 'embed')),
  position_start integer, position_end integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (source_note_id, link_type, position_start, position_end)
);

alter table public.note_versions add column if not exists content_hash text, add column if not exists revision integer, add column if not exists reason text not null default 'initial';

create unique index note_folders_parent_name_idx on public.note_folders (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where archived_at is null;
create index notes_user_search_idx on public.notes (user_id, updated_at desc) where deleted_at is null;
create index notes_folder_idx on public.notes (folder_id) where deleted_at is null;
create index note_links_target_idx on public.note_links (user_id, target_note_id) where archived_at is null;
create index note_links_source_idx on public.note_links (source_note_id) where archived_at is null;
create index note_tags_note_idx on public.note_tags (note_id) where archived_at is null;

create trigger note_folders_updated_at before update on public.note_folders for each row execute procedure public.set_updated_at();
create trigger tags_updated_at before update on public.tags for each row execute procedure public.set_updated_at();
create trigger note_tags_updated_at before update on public.note_tags for each row execute procedure public.set_updated_at();
create trigger note_links_updated_at before update on public.note_links for each row execute procedure public.set_updated_at();

alter table public.note_folders enable row level security;
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_links enable row level security;

create policy "note_folders_select_own" on public.note_folders for select to authenticated using ((select auth.uid()) = user_id);
create policy "note_folders_insert_own" on public.note_folders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "note_folders_update_own" on public.note_folders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_folders_delete_own" on public.note_folders for delete to authenticated using ((select auth.uid()) = user_id);
create policy "tags_select_own" on public.tags for select to authenticated using ((select auth.uid()) = user_id);
create policy "tags_insert_own" on public.tags for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tags_update_own" on public.tags for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tags_delete_own" on public.tags for delete to authenticated using ((select auth.uid()) = user_id);
create policy "note_tags_select_own" on public.note_tags for select to authenticated using ((select auth.uid()) = user_id);
create policy "note_tags_insert_own" on public.note_tags for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "note_tags_update_own" on public.note_tags for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_tags_delete_own" on public.note_tags for delete to authenticated using ((select auth.uid()) = user_id);
create policy "note_links_select_own" on public.note_links for select to authenticated using ((select auth.uid()) = user_id);
create policy "note_links_insert_own" on public.note_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "note_links_update_own" on public.note_links for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_links_delete_own" on public.note_links for delete to authenticated using ((select auth.uid()) = user_id);
