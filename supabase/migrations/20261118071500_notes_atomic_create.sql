-- Notes 3.0 / P0.2: one owner-scoped round trip for creating an empty note.
-- No SECURITY DEFINER: every table INSERT/SELECT is checked by the caller's
-- existing RLS policies. The three writes form one PostgreSQL transaction.
-- Deploy this migration before relying on the RPC; the app retains a guarded
-- legacy fallback when the new function is not yet available.
--
-- The caller generates a per-form UUID once. Repeating the exact same request
-- returns the same created note, but cannot read or claim another user's note.
-- This protects a timeout/retry after a committed server response was lost.

create function public.create_empty_note_atomic(
  p_note_id uuid,
  p_folder_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_id uuid;
  v_existing_id uuid;
  v_created_at timestamptz := now();
  -- Must equal SHA-256 of empty Markdown from src/features/notes/utils.ts.
  v_empty_hash constant text := 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
begin
  if v_user_id is null then
    raise exception 'notes_create_auth_required' using errcode = '28000';
  end if;
  if p_note_id is null then
    raise exception 'notes_create_id_required' using errcode = '22023';
  end if;

  if p_folder_id is not null and not exists (
    select 1
    from public.note_folders f
    where f.id = p_folder_id
      and f.user_id = v_user_id
      and f.archived_at is null
      and f.vault_group_id is null
  ) then
    raise exception 'notes_create_folder_invalid' using errcode = '22023';
  end if;

  insert into public.notes (
    id, user_id, folder_id, title, body_markdown, status, revision,
    content_hash, word_count, character_count, last_saved_at
  ) values (
    p_note_id, v_user_id, p_folder_id, '无标题笔记', '', 'active', 1,
    v_empty_hash, 0, 0, v_created_at
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    -- Only a note already created by this RPC for this owner qualifies as a
    -- retry. A foreign UUID collision cannot escape RLS or hijack the result.
    select n.id into v_existing_id
    from public.notes n
    where n.id = p_note_id
      and n.user_id = v_user_id
      and exists (
        select 1 from public.note_versions v
        where v.note_id = n.id and v.user_id = v_user_id and v.version_number = 1
      )
      and exists (
        select 1 from public.audit_logs a
        where a.user_id = v_user_id
          and a.action = 'create'
          and a.entity_type = 'note'
          and a.entity_id = n.id
          and a.request_id = p_note_id
      )
    limit 1;

    if v_existing_id is null then
      raise exception 'notes_create_id_conflict' using errcode = '23505';
    end if;
    return v_existing_id;
  end if;

  insert into public.note_versions (
    user_id, note_id, title, body_markdown, version_number,
    created_by, content_hash, revision, reason
  ) values (
    v_user_id, v_inserted_id, '无标题笔记', '', 1,
    v_user_id, v_empty_hash, 1, 'initial'
  );

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id,
    actor_type, request_id, after_data
  ) values (
    v_user_id, 'create', 'note', v_inserted_id,
    'user', p_note_id,
    jsonb_build_object('revision', 1, 'folder_id', p_folder_id)
  );

  return v_inserted_id;
end;
$$;

revoke all on function public.create_empty_note_atomic(uuid, uuid) from public;
revoke all on function public.create_empty_note_atomic(uuid, uuid) from anon;
grant execute on function public.create_empty_note_atomic(uuid, uuid) to authenticated;
