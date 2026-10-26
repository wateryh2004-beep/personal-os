-- Monotonic metadata revisions catch ABA and writes from every existing entrypoint.
alter table public.notes add column mutation_revision bigint not null default 0;
alter table public.documents add column mutation_revision bigint not null default 0;
alter table public.entity_links add column mutation_revision bigint not null default 0;
create function public.bump_workbench_revision() returns trigger language plpgsql set search_path='' as $$
begin new.mutation_revision:=old.mutation_revision+1; return new; end $$;
revoke all on function public.bump_workbench_revision() from public,anon,authenticated;
create trigger notes_workbench_revision before update on public.notes for each row execute function public.bump_workbench_revision();
create trigger documents_workbench_revision before update on public.documents for each row execute function public.bump_workbench_revision();
create trigger entity_links_workbench_revision before update on public.entity_links for each row execute function public.bump_workbench_revision();

-- Keep the user's displayed metadata baseline with each lightweight list row.
drop function public.list_notes_workspace(integer,integer);
create function public.list_notes_workspace(p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,title text,excerpt text,updated_at timestamptz,pinned_at timestamptz,folder_id uuid,content_origin text,mutation_revision bigint)
language sql stable security invoker set search_path='' as $$
 select n.id,n.title,null::text,n.updated_at,n.pinned_at,n.folder_id,n.content_origin,n.mutation_revision
 from public.notes n where n.user_id=(select auth.uid()) and n.deleted_at is null and n.status<>'archived'
 order by n.pinned_at desc nulls last,n.updated_at desc
 limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.list_notes_workspace(integer,integer) from public,anon;
grant execute on function public.list_notes_workspace(integer,integer) to authenticated;

-- The entire receipt inherits current privacy for every historical reference.
-- A batch is not partially exposed when one record or its previous folder hides.
-- Definer is needed only to call the service-only fixed ownership helper. This
-- boolean oracle first binds p_owner to auth.uid(), uses no dynamic SQL, and
-- every content lookup retains explicit owner and Vault checks. No DTO is returned.
create function public._workbench_receipt_visible(p_owner uuid,p_operation text,p_target uuid,p_before jsonb,p_after jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb; item jsonb; kind text; folder_kind text; link public.entity_links;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then return false; end if;
 if p_operation like 'note_%' or p_operation like 'file_%' then
  kind:=case when p_operation like 'note_%' then 'note' else 'document' end;
  folder_kind:=case when kind='note' then 'note_folder' else 'file_folder' end;
  if not vault_private.visible(kind,p_target) then return false; end if;
  foreach snapshot in array array[p_before,p_after] loop
   if jsonb_typeof(snapshot)<>'array' then return false; end if;
   for item in select value from jsonb_array_elements(snapshot) loop
    if item->>'id' is null or not vault_private.visible(kind,(item->>'id')::uuid)
      or not vault_private.visible(folder_kind,nullif(item->>'folder_id','')::uuid) then return false; end if;
   end loop;
  end loop;
 elsif p_operation='graph_link' then
  select * into link from public.entity_links where id=p_target and user_id=p_owner;
  if not found or not public._workbench_entity_owned(p_owner,link.source_type,link.source_id) or not public._workbench_entity_owned(p_owner,link.target_type,link.target_id) then return false; end if;
 elsif p_operation='travel_document' then
  foreach snapshot in array array[p_before,p_after] loop
   for item in select value from jsonb_array_elements(coalesce(snapshot->'items','[]'::jsonb)) loop
    if not vault_private.visible('document',nullif(item->>'document_id','')::uuid) then return false; end if;
   end loop;
  end loop;
 end if;
 return true;
exception when invalid_text_representation then return false;
end $$;
revoke all on function public._workbench_receipt_visible(uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public._workbench_receipt_visible(uuid,text,uuid,jsonb,jsonb) to authenticated,service_role;
create policy workspace_receipts_current_visibility on public.workspace_action_receipts as restrictive for select to authenticated
using (public._workbench_receipt_visible(user_id,operation,target_id,before_data,after_data));

create function public.apply_workbench_metadata(p_request_id uuid,p_operation text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); hash text:=md5(p_operation||p_items::text); previous public.workspace_action_receipts;
 item jsonb; n public.notes; d public.documents; b jsonb; a jsonb; before_rows jsonb:='[]'; after_rows jsonb:='[]'; rid uuid; seen uuid[]:='{}'; target uuid; folder uuid; new_title text; expected bigint;
begin
 if owner_id is null then raise exception 'workbench_unauthorized'; end if;
 if p_operation not in ('note_rename','note_move','note_trash','note_archive','file_rename','file_move','file_archive') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'workbench_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
 select * into previous from public.workspace_action_receipts where user_id=owner_id and request_id=p_request_id;
 if found then
   if previous.request_hash<>hash or previous.operation<>p_operation then raise exception 'workbench_request_conflict'; end if;
   return jsonb_build_object('receiptId',previous.id,'rows','[]'::jsonb,'replayed',true,'receiptStatus',previous.status);
 end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
   if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','expectedRevision','title','folderId')) then raise exception 'workbench_invalid'; end if;
   target:=(item->>'id')::uuid; expected:=(item->>'expectedRevision')::bigint;
   if target=any(seen) or expected is null or expected<0 then raise exception 'workbench_invalid'; end if;
   seen:=array_append(seen,target); folder:=nullif(item->>'folderId','')::uuid; new_title:=btrim(item->>'title');
   if p_operation like 'note_%' then
     select * into n from public.notes where id=target and user_id=owner_id and vault_group_id is null and deleted_at is null and archived_at is null for update;
     if not found then raise exception 'workbench_missing'; end if;
     if n.mutation_revision<>expected then raise exception 'workbench_conflict'; end if;
     b:=jsonb_build_object('id',n.id,'title',n.title,'folder_id',n.folder_id,'status',n.status,'deleted_at',n.deleted_at,'archived_at',n.archived_at);
     if p_operation='note_move' and folder is not null and not exists(select 1 from public.note_folders where id=folder and user_id=owner_id and archived_at is null and vault_group_id is null) then raise exception 'workbench_folder_missing'; end if;
     if p_operation='note_rename' then
       if new_title is null or length(new_title) not between 1 and 240 then raise exception 'workbench_invalid'; end if;
       -- Preserve the old high-value body/title once, and advance the editor CAS.
       insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
       select owner_id,n.id,n.title,n.body_markdown,coalesce(max(version_number),0)+1,owner_id,n.content_hash,n.revision,'before_rename' from public.note_versions where note_id=n.id;
     end if;
     update public.notes set title=case when p_operation='note_rename' then new_title else n.title end,
       folder_id=case when p_operation='note_move' then folder else n.folder_id end,
       status=case when p_operation='note_trash' then 'trashed' when p_operation='note_archive' then 'archived' else n.status end,
       deleted_at=case when p_operation='note_trash' then now() else n.deleted_at end,
       archived_at=case when p_operation='note_archive' then now() else n.archived_at end,
       revision=n.revision+case when p_operation='note_rename' then 1 else 0 end
       where id=n.id returning * into n;
     a:=jsonb_build_object('id',n.id,'title',n.title,'folder_id',n.folder_id,'status',n.status,'deleted_at',n.deleted_at,'archived_at',n.archived_at,'mutation_revision',n.mutation_revision,'revision',n.revision);
   else
     select * into d from public.documents where id=target and user_id=owner_id and vault_group_id is null and storage_provider='cloudflare_r2' and storage_state='available' and archived_at is null for update;
     if not found then raise exception 'workbench_missing'; end if;
     if d.mutation_revision<>expected then raise exception 'workbench_conflict'; end if;
     b:=jsonb_build_object('id',d.id,'title',d.title,'folder_id',d.folder_id,'archived_at',d.archived_at,'storage_state',d.storage_state);
     if p_operation='file_move' and folder is not null and not exists(select 1 from public.file_folders where id=folder and user_id=owner_id and archived_at is null and vault_group_id is null) then raise exception 'workbench_folder_missing'; end if;
     if p_operation='file_rename' and (new_title is null or length(new_title) not between 1 and 240) then raise exception 'workbench_invalid'; end if;
     update public.documents set title=case when p_operation='file_rename' then new_title else d.title end,folder_id=case when p_operation='file_move' then folder else d.folder_id end,
       archived_at=case when p_operation='file_archive' then now() else d.archived_at end,storage_state=case when p_operation='file_archive' then 'archived' else d.storage_state end
       where id=d.id returning * into d;
     a:=jsonb_build_object('id',d.id,'title',d.title,'folder_id',d.folder_id,'archived_at',d.archived_at,'storage_state',d.storage_state,'mutation_revision',d.mutation_revision);
   end if;
   before_rows:=before_rows||jsonb_build_array(b); after_rows:=after_rows||jsonb_build_array(a);
   insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,p_operation,case when p_operation like 'note_%' then 'note' else 'document' end,target,'user',jsonb_build_object('request_id',p_request_id));
 end loop;
 rid:=public._record_workbench_receipt(owner_id,p_request_id,hash,p_operation,seen[1],before_rows,after_rows,0);
 return jsonb_build_object('receiptId',rid,'rows',after_rows);
end $$;
revoke all on function public.apply_workbench_metadata(uuid,text,jsonb) from public,anon;
grant execute on function public.apply_workbench_metadata(uuid,text,jsonb) to authenticated;

create function public._workbench_entity_owned(p_owner uuid,p_type text,p_id uuid) returns boolean
language plpgsql set search_path='' as $$
begin
 case p_type
 when 'note' then return exists(select 1 from public.notes where id=p_id and user_id=p_owner and archived_at is null and deleted_at is null and vault_group_id is null);
 when 'document' then return exists(select 1 from public.documents where id=p_id and user_id=p_owner and archived_at is null and storage_state='available' and vault_group_id is null);
 when 'project' then return exists(select 1 from public.projects where id=p_id and user_id=p_owner and archived_at is null);
 when 'experience' then return exists(select 1 from public.experiences where id=p_id and user_id=p_owner and archived_at is null);
 when 'career_opportunity' then return exists(select 1 from public.career_opportunities where id=p_id and user_id=p_owner and archived_at is null);
 when 'career_direction' then return exists(select 1 from public.career_directions where id=p_id and user_id=p_owner and archived_at is null);
 when 'career_track' then return exists(select 1 from public.career_tracks where id=p_id and user_id=p_owner and archived_at is null);
 when 'career_milestone' then return exists(select 1 from public.career_milestones where id=p_id and user_id=p_owner and archived_at is null);
 when 'career_application' then return exists(select 1 from public.career_applications where id=p_id and user_id=p_owner and archived_at is null);
 when 'resume_version' then return exists(select 1 from public.resume_versions where id=p_id and user_id=p_owner and archived_at is null);
 when 'todo_task' then return exists(select 1 from public.microsoft_todo_tasks where id=p_id and user_id=p_owner and archived_at is null);
 when 'calendar_event' then return exists(select 1 from public.calendar_events where id=p_id and user_id=p_owner and archived_at is null);
 when 'review' then return exists(select 1 from public.reviews where id=p_id and user_id=p_owner and archived_at is null);
 else return false;
 end case;
end $$;
revoke all on function public._workbench_entity_owned(uuid,text,uuid) from public,anon,authenticated;

create function public.apply_workbench_link(p_request_id uuid,p_source_type text,p_source_id uuid,p_target_type text,p_target_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); hash text:=md5(p_source_type||p_source_id::text||p_target_type||p_target_id::text); r public.workspace_action_receipts; l public.entity_links; before_value jsonb; rid uuid;
begin
 if owner_id is null then raise exception 'workbench_unauthorized'; end if;
 if p_source_type=p_target_type and p_source_id=p_target_id then raise exception 'workbench_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
 select * into r from public.workspace_action_receipts where user_id=owner_id and request_id=p_request_id;
 if found then
  if r.request_hash<>hash or r.operation<>'graph_link' then raise exception 'workbench_request_conflict'; end if;
  return jsonb_build_object('receiptId',r.id,'rows','[]'::jsonb,'replayed',true,'receiptStatus',r.status);
 end if;
 if not public._workbench_entity_owned(owner_id,p_source_type,p_source_id) or not public._workbench_entity_owned(owner_id,p_target_type,p_target_id) then raise exception 'workbench_missing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||hash,0));
 select * into l from public.entity_links where user_id=owner_id and source_type=p_source_type and source_id=p_source_id and target_type=p_target_type and target_id=p_target_id and relationship_type='related' for update;
 if found then
  before_value:=jsonb_build_object('existed',true,'archived_at',l.archived_at,'id',l.id);
  if l.archived_at is not null then update public.entity_links set archived_at=null where id=l.id returning * into l; end if;
 else
  before_value:=jsonb_build_object('existed',false);
  insert into public.entity_links(user_id,source_type,source_id,target_type,target_id,relationship_type,created_via) values(owner_id,p_source_type,p_source_id,p_target_type,p_target_id,'related','manual') returning * into l;
 end if;
 rid:=public._record_workbench_receipt(owner_id,p_request_id,hash,'graph_link',l.id,before_value,jsonb_build_object('id',l.id,'mutation_revision',l.mutation_revision,'unchanged',coalesce((before_value->>'existed')::boolean,false) and before_value->>'archived_at' is null),l.mutation_revision);
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,'workbench_link','entity_link',l.id,'user',jsonb_build_object('request_id',p_request_id));
 return jsonb_build_object('receiptId',rid,'rows',jsonb_build_array(jsonb_build_object('id',l.id)));
end $$;
revoke all on function public.apply_workbench_link(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.apply_workbench_link(uuid,text,uuid,text,uuid) to authenticated;

-- Aggregate dispatcher is defined after Life migrations. Only it may call this.
create function public._undo_core_workbench_operation(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.workspace_action_receipts; b jsonb; a jsonb; n public.notes; d public.documents; l public.entity_links; folder uuid;
begin
 select * into r from public.workspace_action_receipts where id=p_receipt_id and user_id=auth.uid() for update;
 if not found or not public._workbench_receipt_visible(r.user_id,r.operation,r.target_id,r.before_data,r.after_data) then raise exception 'workbench_missing'; end if;
 if r.status='undone' then return jsonb_build_object('status','undone','receiptId',r.id); end if;
 if r.status<>'available' or r.expires_at<=now() then raise exception 'workbench_expired'; end if;
 if r.operation='graph_link' then
  select * into l from public.entity_links where id=r.target_id and user_id=r.user_id for update;
  if not found or l.mutation_revision<>r.after_revision then raise exception 'workbench_conflict'; end if;
  if not coalesce((r.after_data->>'unchanged')::boolean,false) then
   update public.entity_links set archived_at=case when (r.before_data->>'existed')::boolean then (r.before_data->>'archived_at')::timestamptz else now() end where id=l.id;
  end if;
 elsif r.operation in ('note_rename','note_move','note_trash','note_archive','file_rename','file_move','file_archive') then
  for a in select value from jsonb_array_elements(r.after_data) order by value->>'id' loop
   select value into b from jsonb_array_elements(r.before_data) where value->>'id'=a->>'id';
   if b is null then raise exception 'workbench_invalid'; end if;
   folder:=nullif(b->>'folder_id','')::uuid;
   if r.operation like 'note_%' then
    select * into n from public.notes where id=(a->>'id')::uuid and user_id=r.user_id and vault_group_id is null for update;
    if not found or n.mutation_revision<>(a->>'mutation_revision')::bigint then raise exception 'workbench_conflict'; end if;
    if folder is not null and not exists(select 1 from public.note_folders where id=folder and user_id=r.user_id and archived_at is null and vault_group_id is null) then raise exception 'workbench_folder_missing'; end if;
    if r.operation='note_rename' then
     insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
     select r.user_id,n.id,n.title,n.body_markdown,coalesce(max(version_number),0)+1,r.user_id,n.content_hash,n.revision,'before_undo_rename' from public.note_versions where note_id=n.id;
    end if;
    update public.notes set title=b->>'title',folder_id=folder,status=(b->>'status')::public.note_status,deleted_at=(b->>'deleted_at')::timestamptz,archived_at=(b->>'archived_at')::timestamptz,revision=n.revision+case when r.operation='note_rename' then 1 else 0 end where id=n.id;
   else
    select * into d from public.documents where id=(a->>'id')::uuid and user_id=r.user_id and vault_group_id is null for update;
    if not found or d.mutation_revision<>(a->>'mutation_revision')::bigint then raise exception 'workbench_conflict'; end if;
    if folder is not null and not exists(select 1 from public.file_folders where id=folder and user_id=r.user_id and archived_at is null and vault_group_id is null) then raise exception 'workbench_folder_missing'; end if;
    -- file_archive restoration additionally requires server-only verified-original
    -- proof. The dispatcher consumes a short-lived proof in the same transaction.
    if r.operation='file_archive' then
      if not exists(select 1 from public.workspace_original_checks where receipt_id=r.id and document_id=d.id and mutation_revision=d.mutation_revision and checked_at>now()-interval '2 minutes') then raise exception 'workbench_original_unverified'; end if;
    end if;
    update public.documents set title=b->>'title',folder_id=folder,archived_at=(b->>'archived_at')::timestamptz,storage_state=b->>'storage_state' where id=d.id;
   end if;
  end loop;
 else raise exception 'workbench_invalid'; end if;
 delete from public.workspace_original_checks where receipt_id=r.id;
 update public.workspace_action_receipts set status='undone',undone_at=now() where id=r.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(r.user_id,'workbench_undo','workspace_action',r.target_id,'user',jsonb_build_object('receipt_id',r.id,'operation',r.operation));
 return jsonb_build_object('status','undone','receiptId',r.id);
end $$;
revoke all on function public._undo_core_workbench_operation(uuid) from public,anon,authenticated;

-- Ephemeral original-byte checks are only inserted by an authenticated server
-- integration after R2 checksum verification. They are not backup evidence.
create table public.workspace_original_checks (
 receipt_id uuid not null references public.workspace_action_receipts(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 mutation_revision bigint not null,checked_at timestamptz not null default now(),primary key(receipt_id,document_id)
);
alter table public.workspace_original_checks enable row level security;
alter table public.workspace_original_checks force row level security;
revoke all on public.workspace_original_checks from public,anon,authenticated;
grant all on public.workspace_original_checks to service_role;
