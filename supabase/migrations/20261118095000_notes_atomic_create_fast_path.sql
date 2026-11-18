-- Notes 3.0 P0.2: one authenticated database round trip for note + initial
-- revision + audit. All writes share the caller's transaction and RLS policies.
-- No SECURITY DEFINER and no caller-controlled user_id.
create or replace function public.create_note_fast(p_folder_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_id uuid;
  v_title constant text := '无标题笔记';
  v_hash constant text := 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  v_created_at timestamptz := statement_timestamp();
begin
  if v_owner is null then
    raise exception 'notes_create_not_authenticated' using errcode = '42501';
  end if;

  if p_folder_id is not null and not exists (
    select 1
    from public.note_folders as folder
    where folder.id = p_folder_id
      and folder.user_id = v_owner
      and folder.archived_at is null
      and folder.vault_group_id is null
  ) then
    raise exception 'notes_create_folder_unavailable' using errcode = '22023';
  end if;

  insert into public.notes (
    user_id, folder_id, title, body_markdown, status, revision,
    content_hash, word_count, character_count, last_saved_at
  )
  values (
    v_owner, p_folder_id, v_title, '', 'active', 1,
    v_hash, 0, 0, v_created_at
  )
  returning id into v_id;

  insert into public.note_versions (
    user_id, note_id, title, body_markdown, version_number,
    created_by, content_hash, revision, reason
  )
  values (
    v_owner, v_id, v_title, '', 1,
    v_owner, v_hash, 1, 'initial'
  );

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, actor_type, after_data
  )
  values (
    v_owner, 'create', 'note', v_id, 'user',
    jsonb_build_object('revision', 1, 'folder_id', p_folder_id)
  );

  return v_id;
end;
$$;

-- In particular, don't inherit PostgreSQL's default EXECUTE to PUBLIC.
revoke all on function public.create_note_fast(uuid) from public, anon;
grant execute on function public.create_note_fast(uuid) to authenticated;

comment on function public.create_note_fast(uuid) is
  'Notes 3.0 owner-scoped atomic create; one transaction for note, initial snapshot and audit, under caller RLS.';
