-- Stable Inbox capture and classification intent. Server model work stays outside transactions.
-- JavaScript/Zod text budgets count UTF-16 units, not Unicode code points.
create function private.inbox_ai_utf16_length(p_text text) returns integer language sql immutable strict set search_path='' as $$
 select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer from regexp_split_to_table(p_text,'') c
$$;
revoke all on function private.inbox_ai_utf16_length(text) from public,anon,authenticated;

alter table public.inbox_items
 add column capture_content_hash text,
 add column ai_classification_token uuid,
 add column ai_classification_started_at timestamptz,
 add column ai_classification_content_hash text,
 add constraint inbox_capture_content_hash_shape check(capture_content_hash is null or capture_content_hash ~ '^[0-9a-f]{64}$'),
 add constraint inbox_classification_claim_pair check(
  (ai_classification_token is null and ai_classification_started_at is null and ai_classification_content_hash is null)
  or (ai_classification_token is not null and ai_classification_started_at is not null and ai_classification_content_hash ~ '^[0-9a-f]{64}$'));

create function private.guard_inbox_ai_intent() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.capture_content_hash is not null then raise exception 'captured_inbox_retained' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if current_user not in ('postgres','service_role','supabase_admin') and
    (new.capture_content_hash is not null or new.ai_classification_token is not null or new.ai_classification_started_at is not null or new.ai_classification_content_hash is not null)
   then raise exception 'inbox_intent_server_managed' using errcode='42501';end if;
  return new;
 end if;
 if new.capture_content_hash is distinct from old.capture_content_hash then raise exception 'inbox_capture_immutable' using errcode='42501';end if;
 if current_user not in ('postgres','service_role','supabase_admin') and
  row(new.ai_classification_token,new.ai_classification_started_at,new.ai_classification_content_hash)
   is distinct from row(old.ai_classification_token,old.ai_classification_started_at,old.ai_classification_content_hash)
  then raise exception 'inbox_intent_server_managed' using errcode='42501';end if;
 if row(new.content_markdown,new.processed_at,new.archived_at,new.converted_task_id,new.converted_todo_task_id,new.converted_note_id,new.ai_proposal,new.ai_status)
  is distinct from row(old.content_markdown,old.processed_at,old.archived_at,old.converted_task_id,old.converted_todo_task_id,old.converted_note_id,old.ai_proposal,old.ai_status)
  then new.ai_classification_token:=null;new.ai_classification_started_at:=null;new.ai_classification_content_hash:=null;end if;
 return new;
end $$;
revoke all on function private.guard_inbox_ai_intent() from public,anon,authenticated;
create trigger inbox_ai_intent_guard before insert or update or delete on public.inbox_items for each row execute function private.guard_inbox_ai_intent();

create function public.capture_inbox_intent(p_intent_id uuid,p_content text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); item public.inbox_items%rowtype; inserted uuid; fingerprint text;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_intent_id is null or p_content is null or private.inbox_ai_utf16_length(p_content) not between 1 and 10000 or char_length(btrim(p_content))=0 then raise exception 'capture_invalid' using errcode='22023';end if;
 fingerprint:=encode(sha256(convert_to(p_content,'UTF8')),'hex');
 insert into public.inbox_items(id,user_id,content_markdown,capture_content_hash)
  values(p_intent_id,owner,p_content,fingerprint) on conflict(id) do nothing returning id into inserted;
 if inserted is null then
  select * into item from public.inbox_items where id=p_intent_id and user_id=owner for update;
  if not found or item.capture_content_hash is distinct from fingerprint or item.content_markdown is distinct from p_content
   then raise exception 'capture_intent_conflict' using errcode='40001';end if;
  return jsonb_build_object('inbox_id',item.id,'created',false);
 end if;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
  values(owner,'capture','inbox_item',inserted,'user',jsonb_build_object('character_count',private.inbox_ai_utf16_length(p_content)));
 return jsonb_build_object('inbox_id',inserted,'created',true);
end $$;
revoke all on function public.capture_inbox_intent(uuid,text) from public,anon;
grant execute on function public.capture_inbox_intent(uuid,text) to authenticated;

-- Same source row lock and exact external-claim definition as the existing dispatch mutex.
create function private.inbox_ai_dispatch_free(p_owner uuid,p_inbox_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.todo_creation_receipts r where r.user_id=p_owner and r.inbox_id=p_inbox_id and r.status not in('rejected','cancelled'))
 and not exists(select 1 from public.calendar_operations c where c.user_id=p_owner and c.operation_type='create' and c.payload->>'sourceInboxId'=p_inbox_id::text
  and not(((c.status='cancelled' and c.claimed_at is null) or (c.status='failed' and coalesce(c.result->>'writeOutcome'='not_written',false))) and c.provider_event_id is null and c.remote_committed_at is null and c.cache_committed_at is null));
$$;
revoke all on function private.inbox_ai_dispatch_free(uuid,uuid) from public,anon,authenticated;

create function public.claim_inbox_classification(p_inbox_id uuid,p_token uuid,p_expected_content text,p_explicit_restart boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); item public.inbox_items%rowtype;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_token is null or p_expected_content is null or private.inbox_ai_utf16_length(p_expected_content) not between 1 and 10000 then raise exception 'classification_invalid' using errcode='22023';end if;
 select * into item from public.inbox_items where id=p_inbox_id and user_id=owner for update;
 if not found or item.content_markdown is distinct from p_expected_content or item.processed_at is not null or item.archived_at is not null
  or item.converted_task_id is not null or item.converted_todo_task_id is not null or item.converted_note_id is not null
  or not private.inbox_ai_dispatch_free(owner,p_inbox_id) then return false;end if;
 if not coalesce(p_explicit_restart,false) and (item.ai_classification_token is not null or item.ai_status is not null) then return false;end if;
 update public.inbox_items set ai_classification_token=p_token,ai_classification_started_at=now(),ai_classification_content_hash=encode(sha256(convert_to(p_expected_content,'UTF8')),'hex') where id=p_inbox_id and user_id=owner;
 return true;
end $$;
revoke all on function public.claim_inbox_classification(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.claim_inbox_classification(uuid,uuid,text,boolean) to authenticated;

create function public.commit_inbox_classification(p_inbox_id uuid,p_token uuid,p_expected_content text,p_proposal jsonb,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); item public.inbox_items%rowtype; target text; allowed text[];field text;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 select * into item from public.inbox_items where id=p_inbox_id and user_id=owner for update;
 if not found or item.ai_classification_token is distinct from p_token or p_token is null
  or item.content_markdown is distinct from p_expected_content or item.ai_classification_content_hash is distinct from encode(sha256(convert_to(p_expected_content,'UTF8')),'hex')
  or item.processed_at is not null or item.archived_at is not null or item.converted_task_id is not null or item.converted_todo_task_id is not null or item.converted_note_id is not null
  or not private.inbox_ai_dispatch_free(owner,p_inbox_id) then return false;end if;
 if p_proposal is not null then
  if jsonb_typeof(p_proposal)<>'object' or octet_length(p_proposal::text)>80000 then raise exception 'proposal_invalid' using errcode='22023';end if;
  target:=p_proposal->>'target';
  allowed:=case target when 'task' then array['target','todoListId','title','bodyText','importance','dueAt'] when 'calendar' then array['target','subject','description','startsAt','endsAt','locationName','isAllDay'] when 'note' then array['target','title','bodyMarkdown'] when 'daily' then array['target'] else null end;
  if allowed is null or not (p_proposal ?& allowed) or exists(select 1 from jsonb_object_keys(p_proposal) k where not(k=any(allowed))) then raise exception 'proposal_invalid' using errcode='22023';end if;
  if target='task' then
   if jsonb_typeof(p_proposal->'todoListId') is distinct from 'string'
    or p_proposal->>'todoListId' !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    or jsonb_typeof(p_proposal->'title') is distinct from 'string'
    or private.inbox_ai_utf16_length(btrim(p_proposal->>'title')) not between 1 and 500
    or jsonb_typeof(p_proposal->'bodyText') not in('string','null')
    or private.inbox_ai_utf16_length(p_proposal->>'bodyText')>10000
    or jsonb_typeof(p_proposal->'importance') is distinct from 'string'
    or p_proposal->>'importance' not in('low','normal','high')
    or jsonb_typeof(p_proposal->'dueAt') not in('string','null') then raise exception 'proposal_invalid' using errcode='22023';end if;
   if not exists(select 1 from public.microsoft_todo_lists l where l.id=(p_proposal->>'todoListId')::uuid and l.user_id=owner and l.archived_at is null) then raise exception 'proposal_invalid' using errcode='22023';end if;
  elsif target='note' then
   if jsonb_typeof(p_proposal->'title') is distinct from 'string' or private.inbox_ai_utf16_length(btrim(p_proposal->>'title')) not between 1 and 240
    or jsonb_typeof(p_proposal->'bodyMarkdown') is distinct from 'string' or private.inbox_ai_utf16_length(p_proposal->>'bodyMarkdown')>10000 then raise exception 'proposal_invalid' using errcode='22023';end if;
  elsif target='calendar' then
   if jsonb_typeof(p_proposal->'subject') is distinct from 'string' or private.inbox_ai_utf16_length(btrim(p_proposal->>'subject')) not between 1 and 500
    or jsonb_typeof(p_proposal->'description') not in('string','null') or private.inbox_ai_utf16_length(p_proposal->>'description')>10000
    or jsonb_typeof(p_proposal->'locationName') not in('string','null') or private.inbox_ai_utf16_length(p_proposal->>'locationName')>500
    or jsonb_typeof(p_proposal->'isAllDay') is distinct from 'boolean'
    or jsonb_typeof(p_proposal->'startsAt') is distinct from 'string' or jsonb_typeof(p_proposal->'endsAt') is distinct from 'string' then raise exception 'proposal_invalid' using errcode='22023';end if;
  end if;
  -- Check the wire form before PostgreSQL's more permissive timestamp parser.
  for field in select unnest(case target when 'calendar' then array['startsAt','endsAt'] when 'task' then array['dueAt'] else array[]::text[] end) loop
   if p_proposal->>field is not null then
    if p_proposal->>field !~ '^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$' then raise exception 'proposal_invalid' using errcode='22023';end if;
    begin perform (p_proposal->>field)::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'proposal_invalid' using errcode='22023';end;
   end if;
  end loop;
  if target='calendar' and (p_proposal->>'endsAt')::timestamptz <= (p_proposal->>'startsAt')::timestamptz then raise exception 'proposal_invalid' using errcode='22023';end if;
 end if;
 update public.inbox_items set ai_proposal=p_proposal,ai_status=case when p_proposal is null then 'failed' else 'ready' end,ai_updated_at=now(),
  ai_error=case when p_proposal is null then left(coalesce(p_error,'classification_failed'),240) else null end,
  ai_classification_token=null,ai_classification_started_at=null,ai_classification_content_hash=null where id=p_inbox_id and user_id=owner;
 return true;
end $$;
revoke all on function public.commit_inbox_classification(uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.commit_inbox_classification(uuid,uuid,text,jsonb,text) to authenticated;
