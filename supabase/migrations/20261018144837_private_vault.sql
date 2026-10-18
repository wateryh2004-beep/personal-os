-- Hidden records never become visible to the ordinary authenticated role, even
-- while an owner has unlocked the dedicated server-only vault capability.
create schema if not exists vault_private;
revoke all on schema vault_private from public, anon;
grant usage on schema vault_private to authenticated, service_role;

create table public.vault_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  draft_salt text not null,
  created_at timestamptz not null default now()
);
create table public.vault_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  login_session text not null,
  tab_hash text not null,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index vault_sessions_owner on public.vault_sessions(user_id);
create table public.vault_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts between 0 and 6)
);
do $$ declare t text; begin
  foreach t in array array['vault_credentials','vault_sessions','vault_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['notes','documents','note_folders','file_folders'] loop
    execute format('alter table public.%I add column vault_group_id uuid',t);
    execute format('create index %I on public.%I(user_id,vault_group_id) where vault_group_id is not null',t||'_vault_group',t);
    execute format('create policy vault_ordinary_only on public.%I as restrictive for all to authenticated using (vault_group_id is null) with check (vault_group_id is null)',t);
  end loop;
end $$;

-- Tiny boolean ownership/visibility oracle, never returning content. Definer is
-- necessary to inspect the protected parent without recursive RLS policies.
create function vault_private.visible(kind text, entity uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if entity is null then return true; end if;
  if kind in ('note','notes') then
    return exists(select 1 from public.notes where id=entity and user_id=auth.uid() and vault_group_id is null);
  elsif kind in ('document','documents','file') then
    return exists(select 1 from public.documents where id=entity and user_id=auth.uid() and vault_group_id is null);
  elsif kind='note_folder' then
    return exists(select 1 from public.note_folders where id=entity and user_id=auth.uid() and vault_group_id is null);
  elsif kind='file_folder' then
    return exists(select 1 from public.file_folders where id=entity and user_id=auth.uid() and vault_group_id is null);
  end if;
  return true;
end $$;
revoke all on function vault_private.visible(text,uuid) from public,anon;
grant execute on function vault_private.visible(text,uuid) to authenticated;

create function vault_private.row_visible(row_data jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare k text; kind text; value text;
begin
  foreach k in array array['note_id','linked_note_id','source_note_id','target_note_id','document_id','source_document_id'] loop
    value := row_data->>k;
    if value is not null and not vault_private.visible(case when k like '%document_id' then 'document' else 'note' end,value::uuid) then return false; end if;
  end loop;
  foreach k in array array['entity','source','target','resulting_entity','current_entity'] loop
    kind := row_data->>(k||'_type'); value := row_data->>(k||'_id');
    if kind in ('note','notes','document','documents','file','note_folder','file_folder') and value is not null and not vault_private.visible(kind,value::uuid) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function vault_private.row_visible(jsonb) from public,anon;
grant execute on function vault_private.row_visible(jsonb) to authenticated;

-- Protect historical versions, search index excerpts, audit metadata, links,
-- OCR/cover jobs and other direct references without deleting history.
do $$ declare t record; begin
  for t in select distinct table_name from information_schema.columns
    where table_schema='public' and column_name in
      ('note_id','linked_note_id','source_note_id','target_note_id','document_id','source_document_id','entity_id','source_id','target_id','resulting_entity_id','current_entity_id')
      and table_name not like 'vault_%'
  loop
    execute format('create policy vault_references on public.%I as restrictive for all to authenticated using (vault_private.row_visible(to_jsonb(%I.*))) with check (vault_private.row_visible(to_jsonb(%I.*)))',t.table_name,t.table_name,t.table_name);
  end loop;
end $$;

-- Also close the direct Supabase Storage path for legacy originals.
create function vault_private.storage_visible(bucket text, path text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.documents where user_id=auth.uid() and storage_bucket=bucket and storage_path=path and vault_group_id is not null)
$$;
revoke all on function vault_private.storage_visible(text,text) from public,anon;
grant execute on function vault_private.storage_visible(text,text) to authenticated;
create policy vault_originals on storage.objects as restrictive for all to authenticated
  using(vault_private.storage_visible(bucket_id,name)) with check(vault_private.storage_visible(bucket_id,name));

-- OCR's historical SECURITY DEFINER functions must check the new boundary too.
do $$ declare f record; body text; begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('start_document_ocr','update_document_ocr')
  loop
    body:=pg_get_functiondef(f.oid);
    body:=replace(body,'begin',E'begin\n  if not vault_private.visible(''document'',p_document_id) then raise exception ''vault_locked''; end if;');
    execute body;
  end loop;
end $$;

create function public.vault_consume_attempt(p_user_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  insert into public.vault_attempts(user_id) values(p_user_id) on conflict do nothing;
  update public.vault_attempts set attempts=case when window_started_at < clock_timestamp()-interval '15 minutes' then 1 else least(6,attempts+1) end,
    window_started_at=case when window_started_at < clock_timestamp()-interval '15 minutes' then clock_timestamp() else window_started_at end
    where user_id=p_user_id returning attempts into n;
  return n<=5;
end $$;

create function public.vault_assert_session(p_user_id uuid,p_token text,p_login text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,991));
  if not exists(select 1 from public.vault_sessions where user_id=p_user_id and token_hash=p_token and login_session=p_login
    and expires_at>clock_timestamp() and last_seen_at>clock_timestamp()-interval '5 minutes')
    then raise exception 'vault_locked'; end if;
end $$;

create function public.vault_set_hidden(p_user_id uuid,p_token text,p_login text,p_kind text,p_id uuid,p_hidden boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare group_id uuid; nids uuid[]:='{}'; dids uuid[]:='{}'; fids uuid[]:='{}';
begin
  perform public.vault_assert_session(p_user_id,p_token,p_login);
  if p_kind not in ('note','document','note_folder','file_folder') then raise exception 'vault_invalid_kind'; end if;
  if not p_hidden then
    if p_kind='note' then select vault_group_id into group_id from public.notes where id=p_id and user_id=p_user_id;
    elsif p_kind='document' then select vault_group_id into group_id from public.documents where id=p_id and user_id=p_user_id;
    elsif p_kind='note_folder' then select vault_group_id into group_id from public.note_folders where id=p_id and user_id=p_user_id;
    else select vault_group_id into group_id from public.file_folders where id=p_id and user_id=p_user_id; end if;
    if group_id is null then raise exception 'vault_not_found'; end if;
    select coalesce(array_agg(id),'{}') into nids from public.notes where user_id=p_user_id and vault_group_id=group_id;
    select coalesce(array_agg(id),'{}') into dids from public.documents where user_id=p_user_id and vault_group_id=group_id;
    if exists(select 1 from public.notes n join public.note_folders f on f.id=n.folder_id where n.id=any(nids) and f.vault_group_id is not null and f.vault_group_id<>group_id)
      or exists(select 1 from public.documents d join public.file_folders f on f.id=d.folder_id where d.id=any(dids) and f.vault_group_id is not null and f.vault_group_id<>group_id) then raise exception 'vault_parent_hidden'; end if;
    update public.note_folders set vault_group_id=null where user_id=p_user_id and vault_group_id=group_id;
    update public.file_folders set vault_group_id=null where user_id=p_user_id and vault_group_id=group_id;
    update public.notes set vault_group_id=null where user_id=p_user_id and vault_group_id=group_id;
    update public.documents set vault_group_id=null where user_id=p_user_id and vault_group_id=group_id;
  else
    group_id:=gen_random_uuid();
    -- Serialize against ordinary mutations to close reference/attachment races.
    lock table public.notes,public.documents,public.note_folders,public.file_folders,public.entity_links,public.note_links in share row exclusive mode;
    if p_kind='note' then
      select array_agg(id) into nids from public.notes where id=p_id and user_id=p_user_id and vault_group_id is null;
    elsif p_kind='document' then
      select array_agg(id) into dids from public.documents where id=p_id and user_id=p_user_id and vault_group_id is null and storage_state='available' and storage_provider='cloudflare_r2';
    elsif p_kind='note_folder' then
      with recursive tree as (select id from public.note_folders where id=p_id and user_id=p_user_id and vault_group_id is null
        union select c.id from public.note_folders c join tree t on c.parent_id=t.id where c.user_id=p_user_id and c.vault_group_id is null)
        select array_agg(id) into fids from tree;
      select coalesce(array_agg(id),'{}') into nids from public.notes where folder_id=any(fids) and user_id=p_user_id and vault_group_id is null;
    else
      with recursive tree as (select id from public.file_folders where id=p_id and user_id=p_user_id and vault_group_id is null
        union select c.id from public.file_folders c join tree t on c.parent_id=t.id where c.user_id=p_user_id and c.vault_group_id is null)
        select array_agg(id) into fids from tree;
      select coalesce(array_agg(id),'{}') into dids from public.documents where folder_id=any(fids) and user_id=p_user_id and vault_group_id is null;
    end if;
    if nids is null or dids is null or fids is null then raise exception 'vault_not_found'; end if;
    select coalesce(array_agg(distinct id),'{}') into dids from public.documents where user_id=p_user_id and vault_group_id is null and
      (id=any(dids) or id in (select target_id from public.entity_links where user_id=p_user_id and source_type='note' and source_id=any(nids) and target_type='document' and relationship_type='attachment' and archived_at is null));
    if exists(select 1 from public.documents where id=any(dids) and (storage_state<>'available' or storage_provider<>'cloudflare_r2')) then raise exception 'vault_file_pending'; end if;
    if exists(select 1 from public.note_links l join public.notes n on n.id=l.source_note_id
      where l.user_id=p_user_id and n.vault_group_id is null and not(n.id=any(nids)) and l.archived_at is null
      and (l.target_note_id=any(nids) or l.target_title in (select title from public.notes where id=any(nids))))
      or exists(select 1 from public.entity_links l where l.user_id=p_user_id and l.archived_at is null and
        ((l.target_type='document' and l.target_id=any(dids) and not(l.source_type='note' and l.source_id=any(nids))) or
         (l.target_type='note' and l.target_id=any(nids) and not(l.source_type='note' and l.source_id=any(nids))) or
         (l.source_type='document' and l.source_id=any(dids) and not(l.target_type='note' and l.target_id=any(nids)))))
      or exists(select 1 from public.notes n join public.documents d on d.id=any(dids) and (position(d.id::text in n.body_markdown)>0 or position(d.storage_path in n.body_markdown)>0) where n.user_id=p_user_id and n.vault_group_id is null and not(n.id=any(nids)))
      then raise exception 'vault_shared_reference'; end if;
    if p_kind='note_folder' then update public.note_folders set vault_group_id=group_id where user_id=p_user_id and id=any(fids); end if;
    if p_kind='file_folder' then update public.file_folders set vault_group_id=group_id where user_id=p_user_id and id=any(fids); end if;
    update public.notes set vault_group_id=group_id where user_id=p_user_id and id=any(nids);
    update public.documents set vault_group_id=group_id where user_id=p_user_id and id=any(dids);
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type)
    values(p_user_id,case when p_hidden then 'vault_hide' else 'vault_restore' end,p_kind,p_id,'user');
  return jsonb_build_object('group',group_id,'noteIds',nids,'documentIds',dids);
end $$;

-- Atomic save + immutable version + audit; conflicts never overwrite content.
create function public.vault_save_note(p_user_id uuid,p_token text,p_login text,p_id uuid,p_revision integer,p_title text,p_body text)
returns integer language plpgsql security invoker set search_path='' as $$
declare n public.notes; v integer;
begin
  perform public.vault_assert_session(p_user_id,p_token,p_login);
  if length(p_title)>240 or length(p_body)>200000 then raise exception 'vault_invalid_note'; end if;
  select * into n from public.notes where id=p_id and user_id=p_user_id and vault_group_id is not null for update;
  if not found then raise exception 'vault_not_found'; end if;
  if n.revision<>p_revision then raise exception 'vault_conflict'; end if;
  select coalesce(max(version_number),0)+1 into v from public.note_versions where note_id=n.id and user_id=p_user_id;
  insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,revision,reason)
    values(p_user_id,n.id,n.title,n.body_markdown,v,p_user_id,n.revision,'manual');
  update public.notes set title=coalesce(nullif(p_title,''),'无标题笔记'),body_markdown=p_body,revision=n.revision+1,
    character_count=length(p_body),last_saved_at=clock_timestamp(),content_hash=null where id=n.id and user_id=p_user_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type) values(p_user_id,'vault_save','note',n.id,'user');
  return n.revision+1;
end $$;

-- No callable privileged RPC for a browser, including an already logged-in owner.
revoke all on function public.vault_consume_attempt(uuid),public.vault_assert_session(uuid,text,text),public.vault_set_hidden(uuid,text,text,text,uuid,boolean),public.vault_save_note(uuid,text,text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.vault_consume_attempt(uuid),public.vault_assert_session(uuid,text,text),public.vault_set_hidden(uuid,text,text,text,uuid,boolean),public.vault_save_note(uuid,text,text,uuid,integer,text,text) to service_role;

create function public.vault_create_item(p_user_id uuid,p_token text,p_login text,p_kind text,p_folder uuid,p_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid:=gen_random_uuid(); group_id uuid:=gen_random_uuid();
begin
  perform public.vault_assert_session(p_user_id,p_token,p_login);
  if p_kind not in ('note','note_folder','file_folder') or length(btrim(p_name)) not between 1 and 120 then raise exception 'vault_invalid_item'; end if;
  if p_folder is not null then
    if p_kind='file_folder' then select vault_group_id into group_id from public.file_folders where id=p_folder and user_id=p_user_id and vault_group_id is not null for update;
    else select vault_group_id into group_id from public.note_folders where id=p_folder and user_id=p_user_id and vault_group_id is not null for update; end if;
    if not found then raise exception 'vault_invalid_folder'; end if;
  end if;
  if p_kind='note' then
    insert into public.notes(id,user_id,title,body_markdown,folder_id,vault_group_id,revision,ai_visibility)
      values(result,p_user_id,p_name,'',p_folder,group_id,1,'never');
    insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,revision,reason)
      values(p_user_id,result,p_name,'',1,p_user_id,1,'initial');
  elsif p_kind='note_folder' then
    insert into public.note_folders(id,user_id,name,parent_id,vault_group_id) values(result,p_user_id,p_name,p_folder,group_id);
  else
    insert into public.file_folders(id,user_id,name,parent_id,vault_group_id) values(result,p_user_id,p_name,p_folder,group_id);
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type) values(p_user_id,'vault_create',p_kind,result,'user');
  return result;
end $$;
revoke all on function public.vault_create_item(uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.vault_create_item(uuid,text,text,text,uuid,text) to service_role;
