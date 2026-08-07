-- Files workspace backed by a private Cloudflare R2 bucket.
-- Objects remain in R2; PostgreSQL is the authoritative source for metadata,
-- folders, ownership, auditability, and soft deletion.

create table public.file_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.file_folders(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique nulls not distinct (user_id, parent_id, name)
);

alter table public.documents
  add column folder_id uuid references public.file_folders(id) on delete set null,
  add column storage_provider text not null default 'supabase_storage'
    check (storage_provider in ('supabase_storage', 'cloudflare_r2')),
  add column storage_state text not null default 'available'
    check (storage_state in ('pending', 'available', 'archived'));

alter table public.documents drop constraint documents_file_size_check;
alter table public.documents add constraint documents_file_size_check
  check (file_size > 0 and file_size <= 104857600);

-- RLS protects rows; these invoker triggers also prevent a browser from
-- attaching its document/folder record to another user's folder by guessing ID.
create or replace function public.ensure_file_folder_parent_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.file_folders where id = new.parent_id and user_id = new.user_id
  ) then raise exception 'folder parent must belong to the same user'; end if;
  return new;
end;
$$;

create or replace function public.ensure_document_folder_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.file_folders where id = new.folder_id and user_id = new.user_id
  ) then raise exception 'document folder must belong to the same user'; end if;
  return new;
end;
$$;

create trigger file_folders_owner_integrity
before insert or update of user_id, parent_id on public.file_folders
for each row execute procedure public.ensure_file_folder_parent_owner();
create trigger documents_folder_owner_integrity
before insert or update of user_id, folder_id on public.documents
for each row execute procedure public.ensure_document_folder_owner();

create index file_folders_user_parent_position_idx
  on public.file_folders (user_id, parent_id, position, name)
  where archived_at is null;
create index documents_files_workspace_idx
  on public.documents (user_id, folder_id, uploaded_at desc)
  where archived_at is null and storage_provider = 'cloudflare_r2';

create trigger file_folders_updated_at
before update on public.file_folders
for each row execute procedure public.set_updated_at();

alter table public.file_folders enable row level security;

create policy "file_folders_select_own" on public.file_folders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "file_folders_insert_own" on public.file_folders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "file_folders_update_own" on public.file_folders
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "file_folders_delete_own" on public.file_folders
  for delete to authenticated using ((select auth.uid()) = user_id);
