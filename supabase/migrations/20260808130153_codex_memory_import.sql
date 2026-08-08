create table public.memory_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null check (
    source_system in ('codex', 'claude', 'chatgpt', 'manual_import')
  ),
  source_label text not null check (char_length(source_label) between 1 and 200),
  source_exported_at timestamptz,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  item_count integer not null check (item_count between 1 and 50),
  created_at timestamptz not null default now(),
  unique (user_id, source_system, content_hash)
);

create index memory_import_batches_owner_created_idx
  on public.memory_import_batches (user_id, created_at desc);

alter table public.memory_import_batches enable row level security;

create policy "memory_import_batches_select_own"
  on public.memory_import_batches
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "memory_import_batches_insert_own"
  on public.memory_import_batches
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "memory_import_batches_update_own"
  on public.memory_import_batches
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.memory_import_batches to authenticated;

alter table public.personal_memories
  add column confidence smallint not null default 100
    check (confidence between 0 and 100),
  add column provenance jsonb not null default '{}'::jsonb,
  add column last_verified_at timestamptz;

create or replace function public.import_personal_memory_batch(
  p_source_system text,
  p_source_label text,
  p_source_exported_at timestamptz,
  p_content_hash text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_batch_id uuid;
  v_item jsonb;
  v_existing public.personal_memories;
  v_memory_id uuid;
  v_memory_type text;
  v_memory_key text;
  v_title text;
  v_content text;
  v_ai_visibility text;
  v_valid_until timestamptz;
  v_review_at timestamptz;
  v_confidence smallint;
  v_provenance jsonb;
  v_created integer := 0;
  v_superseded integer := 0;
  v_verified integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_source_system not in ('codex', 'claude', 'chatgpt', 'manual_import') then
    raise exception 'unsupported memory import source';
  end if;
  if char_length(trim(p_source_label)) not between 1 and 200 then
    raise exception 'invalid memory import label';
  end if;
  if p_content_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid memory import hash';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'memory import must contain 1 to 50 items';
  end if;

  insert into public.memory_import_batches (
    user_id,
    source_system,
    source_label,
    source_exported_at,
    content_hash,
    item_count
  ) values (
    v_user_id,
    p_source_system,
    trim(p_source_label),
    p_source_exported_at,
    p_content_hash,
    jsonb_array_length(p_items)
  )
  on conflict (user_id, source_system, content_hash)
  do update set
    source_label = excluded.source_label,
    source_exported_at = excluded.source_exported_at
  returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_memory_type := trim(coalesce(v_item->>'memoryType', ''));
    v_memory_key := trim(coalesce(v_item->>'memoryKey', ''));
    v_title := trim(coalesce(v_item->>'title', ''));
    v_content := trim(coalesce(v_item->>'content', ''));
    v_ai_visibility := coalesce(v_item->>'aiVisibility', 'normal');
    v_valid_until := nullif(v_item->>'validUntil', '')::timestamptz;
    v_review_at := nullif(v_item->>'reviewAt', '')::timestamptz;
    v_confidence := coalesce((v_item->>'confidence')::smallint, 100);

    if v_memory_type not in ('profile', 'working') then
      raise exception 'invalid memory type';
    end if;
    if v_memory_key !~ '^[a-z0-9][a-z0-9._:-]{0,159}$' then
      raise exception 'invalid memory key';
    end if;
    if char_length(v_title) not between 1 and 160
      or char_length(v_content) not between 1 and 10000 then
      raise exception 'invalid memory title or content';
    end if;
    if v_ai_visibility not in ('normal', 'sensitive', 'never') then
      raise exception 'invalid AI visibility';
    end if;
    if v_confidence not between 0 and 100 then
      raise exception 'invalid confidence';
    end if;
    if v_memory_type = 'working'
      and v_valid_until is null
      and v_review_at is null then
      raise exception 'working memory needs validity or review date';
    end if;
    if v_valid_until is not null and v_valid_until <= now() then
      raise exception 'working memory validity must be in the future';
    end if;

    v_provenance := jsonb_build_object(
      'sourceSystem', p_source_system,
      'sourceLabel', trim(p_source_label),
      'batchId', v_batch_id,
      'sourceExportedAt', p_source_exported_at,
      'importedAt', now()
    );

    select * into v_existing
    from public.personal_memories
    where user_id = v_user_id
      and memory_type = v_memory_type
      and memory_key = v_memory_key
      and status = 'active'
      and archived_at is null
    for update;

    if v_existing.id is not null
      and v_existing.title = v_title
      and v_existing.content = v_content
      and v_existing.ai_visibility = v_ai_visibility
      and v_existing.valid_until is not distinct from v_valid_until
      and v_existing.review_at is not distinct from v_review_at then
      update public.personal_memories
      set confidence = v_confidence,
          provenance = v_provenance,
          last_verified_at = now(),
          confirmed_at = now()
      where id = v_existing.id
      returning id into v_memory_id;
      v_verified := v_verified + 1;
    else
      if v_existing.id is not null then
        update public.personal_memories
        set status = 'superseded'
        where id = v_existing.id;
        v_superseded := v_superseded + 1;
      end if;

      insert into public.personal_memories (
        user_id,
        memory_type,
        memory_key,
        title,
        content,
        ai_visibility,
        valid_until,
        review_at,
        supersedes_memory_id,
        created_via,
        confidence,
        provenance,
        last_verified_at
      ) values (
        v_user_id,
        v_memory_type,
        v_memory_key,
        v_title,
        v_content,
        v_ai_visibility,
        v_valid_until,
        v_review_at,
        v_existing.id,
        p_source_system || '_import',
        v_confidence,
        v_provenance,
        now()
      )
      returning id into v_memory_id;
      v_created := v_created + 1;
    end if;

    insert into public.memory_sources (
      user_id,
      memory_id,
      source_type,
      source_id,
      source_role
    ) values (
      v_user_id,
      v_memory_id,
      'memory_import_batch',
      v_batch_id,
      'origin'
    )
    on conflict (memory_id, source_type, source_id, source_role) do nothing;

    v_existing := null;
  end loop;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    actor_type,
    after_data
  ) values (
    v_user_id,
    'memory_import',
    'memory_import_batch',
    v_batch_id,
    'user',
    jsonb_build_object(
      'source_system', p_source_system,
      'item_count', jsonb_array_length(p_items),
      'created', v_created,
      'superseded', v_superseded,
      'verified', v_verified
    )
  );

  return jsonb_build_object(
    'batchId', v_batch_id,
    'created', v_created,
    'superseded', v_superseded,
    'verified', v_verified
  );
end;
$$;

revoke all on function public.import_personal_memory_batch(
  text,
  text,
  timestamptz,
  text,
  jsonb
) from public;

revoke all on function public.import_personal_memory_batch(
  text,
  text,
  timestamptz,
  text,
  jsonb
) from anon;

grant execute on function public.import_personal_memory_batch(
  text,
  text,
  timestamptz,
  text,
  jsonb
) to authenticated;
