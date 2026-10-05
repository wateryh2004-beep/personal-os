-- Prepared only. Apply through the reviewed migration workflow, never on page load.
-- Editorial content and user-authored feedback have different write capabilities.
create schema if not exists leisure_private;
revoke all on schema leisure_private from public, anon, authenticated, service_role;
grant usage on schema leisure_private to authenticated;

create function leisure_private.valid_timestamp(value text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then return false; end if;
  perform value::timestamptz;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

create function leisure_private.valid_http_url(value text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(length(value) <= 2048 and value ~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$', false);
$$;

create function leisure_private.valid_sources(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare source jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) > 20 then return false; end if;
  for source in select jsonb_array_elements(value) loop
    if jsonb_typeof(source) is distinct from 'object' then return false; end if;
    if not (source ?& array['label','url','kind','verification','checked_at'])
      or exists (select 1 from jsonb_object_keys(source) k where k not in ('label','url','kind','verification','checked_at'))
      or jsonb_typeof(source->'label') is distinct from 'string'
      or char_length(btrim(source->>'label')) not between 1 and 160
      or jsonb_typeof(source->'url') is distinct from 'string'
      or not leisure_private.valid_http_url(source->>'url')
      or coalesce(source->>'kind', '') not in ('official','rating','reference')
      or coalesce(source->>'verification', '') not in ('verified','unverified','stale')
      or (source->'checked_at' <> 'null'::jsonb and not leisure_private.valid_timestamp(source->>'checked_at'))
      or (source->>'verification' = 'verified' and not leisure_private.valid_timestamp(source->>'checked_at'))
    then return false; end if;
  end loop;
  return true;
end;
$$;

create function leisure_private.valid_ratings(value jsonb, sources jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare rating jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_typeof(sources) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) > 10 then return false; end if;
  for rating in select jsonb_array_elements(value) loop
    if jsonb_typeof(rating) is distinct from 'object' then return false; end if;
    if not (rating ?& array['platform','value','scale','checked_at','source_url'])
      or exists (select 1 from jsonb_object_keys(rating) k where k not in ('platform','value','scale','checked_at','source_url'))
      or jsonb_typeof(rating->'platform') is distinct from 'string'
      or char_length(btrim(rating->>'platform')) not between 1 and 120
      or jsonb_typeof(rating->'value') is distinct from 'string'
      or char_length(btrim(rating->>'value')) not between 1 and 80
      or (rating->'scale' <> 'null'::jsonb and (jsonb_typeof(rating->'scale') <> 'string' or char_length(btrim(rating->>'scale')) not between 1 and 80))
      or not leisure_private.valid_timestamp(rating->>'checked_at')
      or jsonb_typeof(rating->'source_url') is distinct from 'string'
      or not leisure_private.valid_http_url(rating->>'source_url')
      or not exists (select 1 from jsonb_array_elements(sources) s where s->>'kind' = 'rating' and s->>'url' = rating->>'source_url')
    then return false; end if;
  end loop;
  return true;
end;
$$;

create table public.leisure_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  kind text not null check (kind in ('film','series','game','book','music','outing','other')),
  why text not null check (char_length(btrim(why)) between 1 and 2000),
  body_markdown text not null default '' check (char_length(body_markdown) <= 60000),
  how_to_start text check (how_to_start is null or char_length(btrim(how_to_start)) between 1 and 2000),
  duration_minutes integer check (duration_minutes between 1 and 525600),
  platform text check (platform is null or char_length(btrim(platform)) between 1 and 240),
  location text check (location is null or char_length(btrim(location)) between 1 and 500),
  starts_at timestamptz,
  cost_text text check (cost_text is null or char_length(btrim(cost_text)) between 1 and 240),
  setting text check (setting in ('home','out','either')),
  company text check (company in ('solo','together','either')),
  budget text not null default 'unknown' check (budget in ('free','paid','unknown')),
  sources jsonb not null default '[]'::jsonb check (leisure_private.valid_sources(sources)),
  ratings jsonb not null default '[]'::jsonb check (leisure_private.valid_ratings(ratings, sources)),
  content_revision integer not null default 1 check (content_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, user_id)
);
create index leisure_experiences_owner_updated_idx on public.leisure_experiences (user_id, updated_at desc, id) where archived_at is null;

-- Composite references prevent cross-owner links even if privileged application code errs.
create unique index notes_leisure_owner_key on public.notes (id, user_id);
create table public.leisure_feedback (
  experience_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text check (status in ('interested','planned','current','completed')),
  reaction text not null default 'none' check (reaction in ('liked','not_for_me','none')),
  personal_note text not null default '' check (char_length(personal_note) <= 10000),
  linked_note_id uuid,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (experience_id, user_id) references public.leisure_experiences (id, user_id) on delete cascade,
  foreign key (linked_note_id, user_id) references public.notes (id, user_id) on delete restrict
);
create index leisure_feedback_owner_idx on public.leisure_feedback (user_id, experience_id);
create index leisure_feedback_note_idx on public.leisure_feedback (linked_note_id, user_id) where linked_note_id is not null;

-- Typed domain history, not a generic items/EAV store. Every editorial revision is retained.
create table public.leisure_content_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null,
  content_revision integer not null check (content_revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (experience_id, content_revision),
  foreign key (experience_id, user_id) references public.leisure_experiences (id, user_id) on delete cascade
);
create index leisure_content_versions_owner_idx on public.leisure_content_versions (user_id, experience_id, content_revision desc);

alter table public.leisure_experiences enable row level security;
alter table public.leisure_feedback enable row level security;
alter table public.leisure_content_versions enable row level security;
revoke all on public.leisure_experiences, public.leisure_feedback, public.leisure_content_versions from public, anon, authenticated, service_role;
grant select on public.leisure_experiences, public.leisure_feedback, public.leisure_content_versions to authenticated;
create policy leisure_experiences_read_own on public.leisure_experiences for select to authenticated using ((select auth.uid()) = user_id);
create policy leisure_feedback_read_own on public.leisure_feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy leisure_content_versions_read_own on public.leisure_content_versions for select to authenticated using ((select auth.uid()) = user_id);

-- A narrow SECURITY DEFINER capability is necessary here: callers may not write raw
-- tables, bypass optimistic revisions, forge versions, or omit audits. It is private,
-- not exposed by PostgREST, authenticates explicitly and never accepts user_id.
create function leisure_private.save_feedback(
  p_experience_id uuid, p_expected_revision integer, p_status text, p_reaction text,
  p_personal_note text, p_linked_note_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  previous public.leisure_feedback;
  saved public.leisure_feedback;
  note_title text;
  note_available boolean := false;
begin
  if owner_id is null then raise exception 'leisure_unauthorized' using errcode = '42501'; end if;
  if p_experience_id is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646
    or (p_status is not null and p_status not in ('interested','planned','current','completed'))
    or p_reaction is null or p_reaction not in ('liked','not_for_me','none')
    or p_personal_note is null or char_length(p_personal_note) > 10000
  then raise exception 'leisure_invalid'; end if;
  -- Same lock order as content writes; locks serialize initial feedback creation too.
  perform pg_advisory_xact_lock(hashtextextended('leisure:' || p_experience_id::text, 0));
  perform 1 from public.leisure_experiences where id = p_experience_id and user_id = owner_id and archived_at is null for update;
  if not found then raise exception 'leisure_unavailable'; end if;
  select * into previous from public.leisure_feedback where experience_id = p_experience_id and user_id = owner_id for update;
  if coalesce(previous.revision, 0) <> p_expected_revision then raise exception 'leisure_conflict'; end if;
  if p_linked_note_id is not null then
    select title, (archived_at is null and status = 'active') into note_title, note_available
      from public.notes where id = p_linked_note_id and user_id = owner_id for share;
    if not found then raise exception 'leisure_note_unavailable'; end if;
    -- Preserve an existing owned reference when its note is later archived. A new
    -- assignment still requires a live note; unrelated status edits cannot erase it.
    if not note_available and previous.linked_note_id is distinct from p_linked_note_id
      then raise exception 'leisure_note_unavailable'; end if;
    if not note_available then note_title := null; end if;
  end if;
  insert into public.leisure_feedback (experience_id, user_id, status, reaction, personal_note, linked_note_id, revision)
    values (p_experience_id, owner_id, p_status, p_reaction, p_personal_note, p_linked_note_id, 1)
    on conflict (experience_id) do update set status = excluded.status, reaction = excluded.reaction,
      personal_note = excluded.personal_note, linked_note_id = excluded.linked_note_id,
      revision = previous.revision + 1, updated_at = now(), archived_at = null
    returning * into saved;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, actor_type, before_data, after_data)
    values (owner_id, 'leisure_feedback_save', 'leisure_experience', p_experience_id, 'user',
      case when previous.experience_id is null then null else to_jsonb(previous) - 'user_id' end,
      to_jsonb(saved) - 'user_id');
  return (to_jsonb(saved) - 'user_id' - 'experience_id' - 'created_at' - 'archived_at')
    || jsonb_build_object('linked_note_title', note_title, 'linked_note_available', note_available);
end;
$$;

create function leisure_private.save_content(p_experience_id uuid, p_expected_revision integer, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  previous public.leisure_experiences;
  proposed public.leisure_experiences;
  saved public.leisure_experiences;
  key text;
begin
  if owner_id is null then raise exception 'leisure_unauthorized' using errcode = '42501'; end if;
  if p_experience_id is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646
    or jsonb_typeof(p_content) is distinct from 'object'
  then raise exception 'leisure_invalid'; end if;
  -- Crucial boundary: no status, reaction, note, ownership, revision or archive keys.
  for key in select jsonb_object_keys(p_content) loop
    if key not in ('title','kind','why','body_markdown','how_to_start','duration_minutes','platform','location','starts_at','cost_text','setting','company','budget','sources','ratings')
    then raise exception 'leisure_invalid'; end if;
    if key not in ('duration_minutes','sources','ratings') and jsonb_typeof(p_content->key) not in ('string','null')
    then raise exception 'leisure_invalid'; end if;
  end loop;
  if not (p_content ?& array['title','kind','why','body_markdown','how_to_start','duration_minutes','platform','location','starts_at','cost_text','setting','company','budget','sources','ratings'])
    or (p_content->'duration_minutes' <> 'null'::jsonb and jsonb_typeof(p_content->'duration_minutes') <> 'number')
    or (p_content->'starts_at' <> 'null'::jsonb and not leisure_private.valid_timestamp(p_content->>'starts_at'))
  then raise exception 'leisure_invalid'; end if;
  select * into proposed from jsonb_populate_record(null::public.leisure_experiences, p_content);
  perform pg_advisory_xact_lock(hashtextextended('leisure:' || p_experience_id::text, 0));
  select * into previous from public.leisure_experiences where id = p_experience_id for update;
  if found then
    if previous.user_id <> owner_id or previous.archived_at is not null then raise exception 'leisure_unavailable'; end if;
    if previous.content_revision <> p_expected_revision then raise exception 'leisure_conflict'; end if;
    update public.leisure_experiences set
      title = proposed.title, kind = proposed.kind, why = proposed.why, body_markdown = proposed.body_markdown,
      how_to_start = proposed.how_to_start, duration_minutes = proposed.duration_minutes, platform = proposed.platform,
      location = proposed.location, starts_at = proposed.starts_at, cost_text = proposed.cost_text,
      setting = proposed.setting, company = proposed.company, budget = proposed.budget,
      sources = proposed.sources, ratings = proposed.ratings, content_revision = previous.content_revision + 1, updated_at = now()
      where id = p_experience_id and user_id = owner_id returning * into saved;
  else
    if p_expected_revision <> 0 then raise exception 'leisure_conflict'; end if;
    insert into public.leisure_experiences (id, user_id, title, kind, why, body_markdown, how_to_start, duration_minutes,
      platform, location, starts_at, cost_text, setting, company, budget, sources, ratings)
      values (p_experience_id, owner_id, proposed.title, proposed.kind, proposed.why, proposed.body_markdown, proposed.how_to_start,
        proposed.duration_minutes, proposed.platform, proposed.location, proposed.starts_at, proposed.cost_text,
        proposed.setting, proposed.company, proposed.budget, proposed.sources, proposed.ratings) returning * into saved;
  end if;
  insert into public.leisure_content_versions (user_id, experience_id, content_revision, snapshot)
    values (owner_id, saved.id, saved.content_revision, to_jsonb(saved) - 'user_id');
  insert into public.audit_logs (user_id, action, entity_type, entity_id, actor_type, before_data, after_data)
    values (owner_id, 'leisure_content_save', 'leisure_experience', saved.id, 'user',
      case when previous.id is null then null else to_jsonb(previous) - 'user_id' end, to_jsonb(saved) - 'user_id');
  return to_jsonb(saved) - 'user_id';
end;
$$;

create function leisure_private.archive_experience(p_experience_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); previous public.leisure_experiences; saved public.leisure_experiences;
begin
  if owner_id is null then raise exception 'leisure_unauthorized' using errcode = '42501'; end if;
  if p_experience_id is null or p_expected_revision is null or p_expected_revision not between 1 and 2147483646 then raise exception 'leisure_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leisure:' || p_experience_id::text, 0));
  select * into previous from public.leisure_experiences where id = p_experience_id and user_id = owner_id and archived_at is null for update;
  if not found then raise exception 'leisure_unavailable'; end if;
  if previous.content_revision <> p_expected_revision then raise exception 'leisure_conflict'; end if;
  update public.leisure_experiences set archived_at = now(), updated_at = now(), content_revision = content_revision + 1
    where id = p_experience_id and user_id = owner_id returning * into saved;
  insert into public.leisure_content_versions (user_id, experience_id, content_revision, snapshot)
    values (owner_id, saved.id, saved.content_revision, to_jsonb(saved) - 'user_id');
  insert into public.audit_logs (user_id, action, entity_type, entity_id, actor_type, before_data, after_data)
    values (owner_id, 'leisure_archive', 'leisure_experience', saved.id, 'user', to_jsonb(previous) - 'user_id', to_jsonb(saved) - 'user_id');
end;
$$;

-- Public API functions are invokers. Privilege elevation is confined to the private
-- capability functions above, whose only writers are explicitly authenticated owners.
create function public.save_leisure_feedback(p_experience_id uuid, p_expected_revision integer, p_status text, p_reaction text, p_personal_note text, p_linked_note_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select leisure_private.save_feedback(p_experience_id, p_expected_revision, p_status, p_reaction, p_personal_note, p_linked_note_id);
$$;
create function public.save_leisure_content(p_experience_id uuid, p_expected_revision integer, p_content jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select leisure_private.save_content(p_experience_id, p_expected_revision, p_content);
$$;
create function public.archive_leisure_experience(p_experience_id uuid, p_expected_revision integer)
returns void language sql security invoker set search_path = '' as $$
  select leisure_private.archive_experience(p_experience_id, p_expected_revision);
$$;

revoke all on all functions in schema leisure_private from public, anon, authenticated, service_role;
grant execute on function leisure_private.save_feedback(uuid, integer, text, text, text, uuid),
  leisure_private.save_content(uuid, integer, jsonb), leisure_private.archive_experience(uuid, integer) to authenticated;
revoke all on function public.save_leisure_feedback(uuid, integer, text, text, text, uuid),
  public.save_leisure_content(uuid, integer, jsonb), public.archive_leisure_experience(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.save_leisure_feedback(uuid, integer, text, text, text, uuid),
  public.save_leisure_content(uuid, integer, jsonb), public.archive_leisure_experience(uuid, integer) to authenticated;

comment on table public.leisure_feedback is 'User-owned personal experience and feedback. Editorial/AI ingestion must never target this table or its write capability.';
comment on function public.save_leisure_content(uuid, integer, jsonb) is 'Bounded editorial contract; rejects all personal feedback keys and commits content, immutable revision and audit together. No external OAuth scope is enabled by this migration.';
