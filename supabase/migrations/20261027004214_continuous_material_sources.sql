-- Compatible extension: originals/versions remain authoritative; no generic jobs table.
create or replace function public.capture_note_source(p_note_id uuid,p_expected_revision integer,p_expected_hash text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.notes%rowtype; v uuid; next_number integer;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into n from public.notes where id=p_note_id and user_id=auth.uid() and vault_group_id is null and archived_at is null and deleted_at is null for update;
 if not found then raise exception 'note_unavailable' using errcode='42501'; end if;
 if n.revision<>p_expected_revision or encode(sha256(convert_to(n.body_markdown,'UTF8')),'hex')<>p_expected_hash then raise exception 'note_source_conflict' using errcode='40001'; end if;
 select id into v from public.note_versions where note_id=n.id and user_id=auth.uid() and reason='source_citation' and revision=n.revision and body_markdown=n.body_markdown and title=n.title and archived_at is null order by version_number desc limit 1;
 if v is null then
  select coalesce(max(version_number),0)+1 into next_number from public.note_versions where note_id=n.id;
  insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
   values(auth.uid(),n.id,n.title,n.body_markdown,next_number,auth.uid(),p_expected_hash,n.revision,'source_citation') returning id into v;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'capture_source','note',n.id,'user',jsonb_build_object('version_id',v,'revision',n.revision));
 end if;
 return v;
end $$;
revoke all on function public.capture_note_source(uuid,integer,text) from public,anon;
grant execute on function public.capture_note_source(uuid,integer,text) to authenticated;

create or replace function public.convert_inbox_note(p_inbox_id uuid,p_title text,p_body text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.inbox_items%rowtype; nid uuid; body text; hash text;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if char_length(trim(p_title)) not between 1 and 240 or char_length(p_body)>10000 then raise exception 'invalid_note'; end if;
 select * into i from public.inbox_items where id=p_inbox_id and user_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'inbox_unavailable' using errcode='42501'; end if;
 if i.converted_note_id is not null then
  perform 1 from public.notes where id=i.converted_note_id and user_id=auth.uid() and vault_group_id is null and archived_at is null and deleted_at is null;
  if not found then raise exception 'destination_unavailable'; end if;
  perform 1 from public.note_versions where note_id=i.converted_note_id and user_id=auth.uid() and version_number=1 and title=trim(p_title) and body_markdown=case when p_body='' then i.content_markdown else p_body end;
  if not found then raise exception 'inbox_request_conflict' using errcode='40001';end if;
  return i.converted_note_id;
 end if;
 if i.processed_at is not null or i.converted_task_id is not null or i.converted_todo_task_id is not null then raise exception 'inbox_already_processed' using errcode='40001'; end if;
 body:=case when p_body='' then i.content_markdown else p_body end;
 hash:=encode(sha256(convert_to(body,'UTF8')),'hex');
 insert into public.notes(user_id,title,body_markdown,status,revision,content_hash,word_count,character_count,last_saved_at)
 values(auth.uid(),trim(p_title),body,'active',1,hash,case when trim(body)='' then 0 else cardinality(regexp_split_to_array(trim(body),'\s+')) end,char_length(body),now()) returning id into nid;
 insert into public.note_versions(user_id,note_id,title,body_markdown,version_number,created_by,content_hash,revision,reason)
 values(auth.uid(),nid,trim(p_title),body,1,auth.uid(),hash,1,'initial');
 update public.inbox_items set converted_note_id=nid,processed_at=now() where id=i.id and user_id=auth.uid();
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),'convert_to_note','inbox_item',i.id,'user',jsonb_build_object('note_id',nid,'content_hash',hash));
 return nid;
end $$;
revoke all on function public.convert_inbox_note(uuid,text,text) from public,anon;
grant execute on function public.convert_inbox_note(uuid,text,text) to authenticated;

create function public.protect_note_source_version() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.reason='source_citation' then
  if tg_op='DELETE' then raise exception 'source_version_is_immutable';end if;
  if row(new.id,new.user_id,new.note_id,new.title,new.body_markdown,new.version_number,new.created_by,new.content_hash,new.revision,new.reason,new.created_at) is distinct from row(old.id,old.user_id,old.note_id,old.title,old.body_markdown,old.version_number,old.created_by,old.content_hash,old.revision,old.reason,old.created_at) then raise exception 'source_version_is_immutable';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.protect_note_source_version() from public,anon,authenticated;
create trigger protect_note_source_version before update or delete on public.note_versions for each row execute function public.protect_note_source_version();
