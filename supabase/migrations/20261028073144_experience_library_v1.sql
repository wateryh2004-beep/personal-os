-- Experience Library V1 keeps pasted source text append-only and references
-- already-sealed private R2 originals through public.documents. This migration
-- does not change Notes or Career tables.

create table public.experience_library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creation_request_id uuid not null,
  source_url text check (source_url is null or char_length(source_url) between 1 and 2048),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  tags text[] not null default '{}'::text[],
  ai_summary text check (ai_summary is null or char_length(ai_summary) <= 4000),
  ai_key_points jsonb check (ai_key_points is null or jsonb_typeof(ai_key_points) = 'array'),
  ai_status text not null default 'not_requested'
    check (ai_status in ('not_requested', 'completed', 'failed')),
  ai_error_code text check (ai_error_code is null or char_length(ai_error_code) <= 120),
  ai_provider text check (ai_provider is null or ai_provider in ('deepseek', 'qwen')),
  ai_model text check (ai_model is null or char_length(ai_model) between 1 and 160),
  ai_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, creation_request_id)
);

create unique index experience_library_entries_source_url_idx
  on public.experience_library_entries (user_id, source_url)
  where source_url is not null and archived_at is null;
create index experience_library_entries_recent_idx
  on public.experience_library_entries (user_id, updated_at desc)
  where archived_at is null;
create index experience_library_entries_tags_idx
  on public.experience_library_entries using gin (tags)
  where archived_at is null;

create table public.experience_library_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  request_id uuid not null,
  capture_type text not null check (capture_type in ('post', 'comment', 'mixed', 'unknown')),
  raw_content text not null check (char_length(raw_content) between 1 and 200000),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  segments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) > 0),
  speaker text check (speaker is null or char_length(btrim(speaker)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index experience_library_captures_entry_created_idx
  on public.experience_library_captures (user_id, entry_id, created_at, id);

create table public.experience_library_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.experience_library_entries(id) on delete restrict,
  capture_id uuid references public.experience_library_captures(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  selection_start integer,
  selection_end integer,
  selection_quote text check (selection_quote is null or char_length(selection_quote) <= 20000),
  position integer not null default 0 check (position between 0 and 100000),
  caption text check (caption is null or char_length(caption) <= 500),
  source_kind text not null default 'clipboard' check (source_kind in ('clipboard', 'drop', 'file')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (selection_start is null and selection_end is null and selection_quote is null)
    or (
      selection_start is not null and selection_end is not null
      and selection_start >= 0 and selection_end >= selection_start
      and selection_quote is not null and char_length(selection_quote) > 0
    )
  )
);

create unique index experience_library_media_document_idx
  on public.experience_library_media (user_id, entry_id, document_id)
  where archived_at is null;
create index experience_library_media_entry_position_idx
  on public.experience_library_media (user_id, entry_id, position, created_at)
  where archived_at is null;
create index experience_library_media_capture_idx
  on public.experience_library_media (user_id, capture_id, position)
  where archived_at is null;

create table public.experience_library_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('deepseek', 'qwen')),
  model_id text not null check (
    char_length(btrim(model_id)) between 1 and 160
    and model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
  ),
  api_key_ciphertext text not null check (char_length(api_key_ciphertext) > 40),
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.protect_experience_library_capture()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'experience library captures are append-only';
end;
$$;

create trigger experience_library_captures_append_only
before update or delete on public.experience_library_captures
for each row execute procedure public.protect_experience_library_capture();

create or replace function public.ensure_experience_library_capture_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entry_owner uuid;
begin
  select user_id into entry_owner
  from public.experience_library_entries
  where id = new.entry_id;
  if entry_owner is null or entry_owner <> new.user_id then
    raise exception 'experience library capture must belong to the same owner and entry';
  end if;
  return new;
end;
$$;

create trigger experience_library_captures_owner_integrity
before insert on public.experience_library_captures
for each row execute procedure public.ensure_experience_library_capture_owner();

create or replace function public.ensure_experience_library_media_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entry_owner uuid;
  capture_owner uuid;
  capture_entry uuid;
  capture_raw text;
  document_owner uuid;
  document_provider text;
  document_state text;
  document_archived_at timestamptz;
  document_mime text;
  document_filename text;
  document_vault_group_id uuid;
  utf16_offset integer;
  selection_start_character integer;
  selection_end_character integer;
  character_index integer;
begin
  select user_id into entry_owner
  from public.experience_library_entries
  where id = new.entry_id;
  if entry_owner is null or entry_owner <> new.user_id then
    raise exception 'experience library media entry must belong to the same owner';
  end if;

  if new.capture_id is not null then
    select user_id, entry_id, raw_content into capture_owner, capture_entry, capture_raw
    from public.experience_library_captures
    where id = new.capture_id;
    if capture_owner is null
      or capture_owner <> new.user_id
      or capture_entry <> new.entry_id then
      raise exception 'experience library media capture must belong to the same entry and owner';
    end if;
    if new.selection_end is not null then
      -- Browser textarea offsets count UTF-16 code units; PostgreSQL substrings
      -- count Unicode code points. Convert only at valid character boundaries.
      utf16_offset := 0;
      selection_start_character := null;
      selection_end_character := null;
      for character_index in 0..char_length(capture_raw) loop
        if utf16_offset = new.selection_start then selection_start_character := character_index; end if;
        if utf16_offset = new.selection_end then selection_end_character := character_index; end if;
        exit when character_index = char_length(capture_raw) or utf16_offset >= new.selection_end;
        utf16_offset := utf16_offset + case when octet_length(convert_to(substring(capture_raw from character_index + 1 for 1), 'UTF8')) = 4 then 2 else 1 end;
      end loop;
      if selection_start_character is null or selection_end_character is null then
        raise exception 'experience library media selection is outside the capture or splits a character';
      end if;
      if substring(capture_raw from selection_start_character + 1 for selection_end_character - selection_start_character)
        is distinct from new.selection_quote then
        raise exception 'experience library media selection quote does not match the capture';
      end if;
    end if;
  elsif new.selection_start is not null then
    raise exception 'experience library media text selection requires a capture';
  end if;

  select user_id, storage_provider, storage_state, archived_at, mime_type, original_filename, vault_group_id
    into document_owner, document_provider, document_state, document_archived_at,
      document_mime, document_filename, document_vault_group_id
  from public.documents
  where id = new.document_id;
  if document_owner is null
    or document_owner <> new.user_id
    or document_provider <> 'cloudflare_r2'
    or document_state <> 'available'
    or document_archived_at is not null
    or document_vault_group_id is not null
    or document_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif')
    or lower(document_filename) !~ '\.(png|jpe?g|webp|gif|avif)$' then
    raise exception 'experience library media document must be an available private original owned by the same user';
  end if;
  return new;
end;
$$;

create trigger experience_library_media_owner_integrity
before insert or update of user_id, entry_id, capture_id, document_id,
  selection_start, selection_end, selection_quote
on public.experience_library_media
for each row execute procedure public.ensure_experience_library_media_owner();

create trigger experience_library_entries_updated_at
before update on public.experience_library_entries
for each row execute procedure public.set_updated_at();
create trigger experience_library_media_updated_at
before update on public.experience_library_media
for each row execute procedure public.set_updated_at();
create trigger experience_library_ai_settings_updated_at
before update on public.experience_library_ai_settings
for each row execute procedure public.set_updated_at();

alter table public.experience_library_entries enable row level security;
alter table public.experience_library_captures enable row level security;
alter table public.experience_library_media enable row level security;
alter table public.experience_library_ai_settings enable row level security;
alter table public.experience_library_entries force row level security;
alter table public.experience_library_captures force row level security;
alter table public.experience_library_media force row level security;
alter table public.experience_library_ai_settings force row level security;

create policy "experience_library_entries_select_own"
  on public.experience_library_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "experience_library_entries_insert_own"
  on public.experience_library_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "experience_library_entries_update_own"
  on public.experience_library_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "experience_library_captures_select_own"
  on public.experience_library_captures for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "experience_library_captures_insert_own"
  on public.experience_library_captures for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "experience_library_media_select_own"
  on public.experience_library_media for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "experience_library_media_insert_own"
  on public.experience_library_media for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "experience_library_media_update_own"
  on public.experience_library_media for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "experience_library_ai_settings_select_own"
  on public.experience_library_ai_settings for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.experience_library_entries,
  public.experience_library_captures,
  public.experience_library_media,
  public.experience_library_ai_settings
from anon, authenticated;

grant select, insert, update on public.experience_library_entries to authenticated;
grant select, insert on public.experience_library_captures to authenticated;
grant select, insert, update on public.experience_library_media to authenticated;
grant select (user_id, provider, model_id, last_tested_at, created_at, updated_at)
  on public.experience_library_ai_settings to authenticated;
grant select, insert, update, delete on public.experience_library_ai_settings to service_role;

revoke all on function public.protect_experience_library_capture() from public, anon, authenticated;
revoke all on function public.ensure_experience_library_capture_owner() from public, anon, authenticated;
revoke all on function public.ensure_experience_library_media_owner() from public, anon, authenticated;

-- One transaction creates or reuses the URL-scoped entry and appends the raw paste.
-- An identical request id returns the original result, making lost replies retry-safe.
create or replace function public.append_experience_library_capture(
  p_entry_id uuid,
  p_source_url text,
  p_title text,
  p_capture_type text,
  p_raw_content text,
  p_segments jsonb,
  p_tags text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_entry public.experience_library_entries%rowtype;
  target_capture_id uuid;
  existing_capture public.experience_library_captures%rowtype;
  created_entry boolean := false;
  clean_title text := btrim(coalesce(p_title, ''));
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_request_id is null then
    raise exception 'request id required';
  end if;
  if p_capture_type not in ('post', 'comment', 'mixed', 'unknown') then
    raise exception 'invalid capture type';
  end if;
  if p_raw_content is not null
    and (char_length(p_raw_content) < 1 or char_length(p_raw_content) > 200000) then
    raise exception 'capture text length invalid';
  end if;
  if p_raw_content is not null and (
    p_segments is null
    or jsonb_typeof(p_segments) <> 'array'
    or jsonb_array_length(p_segments) = 0
  ) then
    raise exception 'capture segments invalid';
  end if;
  if clean_title = '' then
    clean_title := '未命名经验';
  end if;
  if char_length(clean_title) > 240 then
    clean_title := left(clean_title, 240);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || coalesce(p_source_url, p_request_id::text), 0)
  );

  select * into target_entry
  from public.experience_library_entries
  where user_id = current_user_id
    and archived_at is null
    and (
      (p_entry_id is not null and id = p_entry_id)
      or (
        p_entry_id is null
        and p_source_url is not null
        and source_url = p_source_url
      )
      or creation_request_id = p_request_id
    )
  order by
    case when creation_request_id = p_request_id then 0 else 1 end,
    created_at
  limit 1;

  if target_entry.id is null then
    if p_entry_id is not null then
      raise exception 'entry is unavailable or not owned';
    end if;
    insert into public.experience_library_entries (
      user_id, creation_request_id, source_url, title, tags
    ) values (
      current_user_id,
      p_request_id,
      nullif(btrim(p_source_url), ''),
      clean_title,
      coalesce(p_tags, '{}'::text[])
    )
    returning * into target_entry;
    created_entry := true;
  else
    if p_entry_id is not null and target_entry.id <> p_entry_id then
      raise exception 'entry is unavailable or not owned';
    end if;
    if p_tags is not null and cardinality(p_tags) > 0 then
      update public.experience_library_entries
      set tags = (
        select coalesce(array_agg(distinct tag order by tag), '{}'::text[])
        from unnest(target_entry.tags || p_tags) as tag
        where btrim(tag) <> ''
      )
      where id = target_entry.id and user_id = current_user_id;
    end if;
  end if;

  if p_raw_content is not null then
    select * into existing_capture
    from public.experience_library_captures
    where user_id = current_user_id and request_id = p_request_id;
    target_capture_id := existing_capture.id;
    if target_capture_id is not null and (
      existing_capture.entry_id <> target_entry.id
      or existing_capture.raw_content is distinct from p_raw_content
      or existing_capture.capture_type is distinct from p_capture_type
      or existing_capture.segments is distinct from p_segments
    ) then
      raise exception 'experience capture retry payload changed';
    end if;
    if target_capture_id is null then
      insert into public.experience_library_captures (
        user_id, entry_id, request_id, capture_type, raw_content,
        content_sha256, segments
      ) values (
        current_user_id,
        target_entry.id,
        p_request_id,
        p_capture_type,
        p_raw_content,
        encode(sha256(convert_to(p_raw_content, 'UTF8')), 'hex'),
        p_segments
      )
      returning id into target_capture_id;
    end if;
  end if;

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, actor_type, after_data
  ) values (
    current_user_id,
    case when created_entry then 'create' else 'append' end,
    'experience_library_entry',
    target_entry.id,
    'user',
    jsonb_build_object(
      'created_entry', created_entry,
      'capture_id', target_capture_id,
      'capture_type', p_capture_type,
      'character_count', coalesce(char_length(p_raw_content), 0),
      'tag_count', coalesce(cardinality(p_tags), 0)
    )
  );

  return jsonb_build_object(
    'entry_id', target_entry.id,
    'capture_id', target_capture_id,
    'title', target_entry.title,
    'created_entry', created_entry,
    'appended', target_capture_id is not null
  );
end;
$$;

revoke all on function public.append_experience_library_capture(
  uuid, text, text, text, text, jsonb, text[], uuid
) from public, anon, authenticated;
grant execute on function public.append_experience_library_capture(
  uuid, text, text, text, text, jsonb, text[], uuid
) to authenticated;

create or replace function public.search_experience_library(p_query text)
returns table (
  id uuid,
  source_url text,
  title text,
  tags text[],
  ai_summary text,
  ai_status text,
  ai_error_code text,
  ai_provider text,
  ai_model text,
  ai_analyzed_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  capture_count bigint,
  media_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    entry.id,
    entry.source_url,
    entry.title,
    entry.tags,
    entry.ai_summary,
    entry.ai_status,
    entry.ai_error_code,
    entry.ai_provider,
    entry.ai_model,
    entry.ai_analyzed_at,
    entry.updated_at,
    entry.created_at,
    (select count(*) from public.experience_library_captures as capture
      where capture.entry_id = entry.id and capture.user_id = (select auth.uid())),
    (select count(*) from public.experience_library_media as media
      where media.entry_id = entry.id and media.user_id = (select auth.uid())
        and media.archived_at is null)
  from public.experience_library_entries as entry
  where entry.user_id = (select auth.uid())
    and entry.archived_at is null
    and (
      lower(btrim(left(coalesce(p_query, ''), 120))) = ''
      or position(
        lower(btrim(left(coalesce(p_query, ''), 120))) in lower(
          concat_ws(
            E'\n',
            entry.title,
            entry.ai_summary,
            array_to_string(entry.tags, ' '),
            (
              select string_agg(capture.raw_content, E'\n')
              from public.experience_library_captures as capture
              where capture.entry_id = entry.id
                and capture.user_id = (select auth.uid())
            )
          )
        )
      ) > 0
    )
  order by entry.updated_at desc, entry.id
  limit 60;
$$;

revoke all on function public.search_experience_library(text) from public, anon, authenticated;
grant execute on function public.search_experience_library(text) to authenticated;

comment on table public.experience_library_captures is
  'Append-only pasted originals. Text is never silently overwritten; media selections are stored separately.';
comment on table public.experience_library_media is
  'Owner-checked metadata linking an experience capture to a sealed private R2 document.';
comment on column public.experience_library_ai_settings.api_key_ciphertext is
  'AES-256-GCM ciphertext read only by the server action boundary; excluded from portable exports.';
