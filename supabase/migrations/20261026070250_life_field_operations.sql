-- Compatible domain fields; legacy unknown quantities/progress remain NULL.
create schema if not exists life_private;
revoke all on schema life_private from public, anon, authenticated, service_role;
grant usage on schema life_private to authenticated;
alter table public.purchase_items add column quantity text,
  add column quantity_unit text, add column mutation_revision bigint not null default 1 check(mutation_revision>0);
alter table public.purchase_items add constraint purchase_quantity_valid check (
  (quantity is null and quantity_unit is null) or
  (quantity is not null and quantity ~ '^\d{1,9}(\.\d{1,3})?$' and quantity::numeric > 0 and quantity_unit is not null and char_length(btrim(quantity_unit)) between 1 and 24));
alter table public.trips add column mutation_revision bigint not null default 1 check(mutation_revision>0),
  add column current_stop_id uuid, add column next_stop_id uuid;
alter table public.trip_stops add column mutation_revision bigint not null default 1 check(mutation_revision>0), add column arrived_at timestamptz;
alter table public.trips add constraint trips_id_owner_unique unique(id,user_id);
alter table public.trip_stops add constraint trip_stops_trip_owner_unique unique(id,trip_id,user_id);
alter table public.trips add constraint trips_current_stop_owned foreign key(current_stop_id,id,user_id) references public.trip_stops(id,trip_id,user_id) deferrable initially deferred,
  add constraint trips_next_stop_owned foreign key(next_stop_id,id,user_id) references public.trip_stops(id,trip_id,user_id) deferrable initially deferred;
-- Existing documents only guarantee the UUID PK. Add an explicit compound
-- uniqueness target for the owned Files relationship; existing IDs cannot collide.
alter table public.documents add constraint documents_life_id_owner_unique unique(id,user_id);
create table public.trip_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  trip_id uuid not null, document_id uuid not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(trip_id,document_id),
  foreign key(trip_id,user_id) references public.trips(id,user_id) on delete restrict,
  foreign key(document_id,user_id) references public.documents(id,user_id) on delete restrict
);
create index trip_documents_owner_idx on public.trip_documents(user_id,trip_id);
create index trip_documents_document_idx on public.trip_documents(document_id,user_id);
alter table public.trip_documents enable row level security;
alter table public.trip_documents force row level security;
revoke all on public.trip_documents from public,anon,authenticated,service_role;
grant select on public.trip_documents to authenticated;
grant select,insert,update on public.trip_documents to service_role;
create policy trip_documents_read_own on public.trip_documents for select to authenticated using((select auth.uid())=user_id);
-- The relation itself is private when Files later moves its endpoint into Vault.
create policy trip_documents_ordinary_document on public.trip_documents as restrictive for select to authenticated
using(exists(select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid()) and d.vault_group_id is null));
alter table public.leisure_feedback add column progress_unit text,
  add column progress_value integer, add column progress_total integer;
alter table public.leisure_feedback add constraint leisure_progress_valid check (
  (progress_unit is null and progress_value is null and progress_total is null) or
  (progress_unit is not null and progress_unit in ('page','episode','minute') and progress_value is not null and progress_value between 0 and 1000000 and
    (progress_total is null or progress_total between 1 and 1000000 and progress_value<=progress_total)));
-- All legacy writes also invalidate an older receipt, including ABA changes.
create function life_private.advance_revision() returns trigger language plpgsql set search_path='' as $$
begin new.mutation_revision := old.mutation_revision+1; return new; end; $$;
create trigger purchase_mutation_revision before update on public.purchase_items for each row execute function life_private.advance_revision();
create trigger trips_mutation_revision before update on public.trips for each row execute function life_private.advance_revision();
create trigger trip_stops_mutation_revision before update on public.trip_stops for each row execute function life_private.advance_revision();
create function life_private.advance_feedback_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision := old.revision+1; return new; end; $$;
create trigger leisure_feedback_monotonic_revision before update on public.leisure_feedback for each row execute function life_private.advance_feedback_revision();

-- Projection deliberately contains no notes, JD, personal text, URLs or document bytes.
create function life_private.metadata(p_operation text,p_id uuid,p_document_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; owner_id uuid:=auth.uid();
begin
 if p_operation='shopping_quantity' then
  select jsonb_build_object('id',id,'mutation_revision',mutation_revision,'quantity',quantity,'quantity_unit',quantity_unit) into result from public.purchase_items where id=p_id and user_id=owner_id and archived_at is null;
 elsif p_operation='shopping_purchased' then
  select jsonb_build_object('id',id,'mutation_revision',mutation_revision,'status',status,'purchased_at',purchased_at,'cooldown_until',cooldown_until) into result from public.purchase_items where id=p_id and user_id=owner_id and archived_at is null;
 elsif p_operation='travel_stop_metadata' then
  select jsonb_build_object('id',id,'trip_id',trip_id,'trip_revision',(select t.mutation_revision from public.trips t where t.id=trip_id and t.user_id=owner_id and t.archived_at is null),'mutation_revision',mutation_revision,'day_number',day_number,'planned_time',planned_time,'duration_minutes',duration_minutes) into result from public.trip_stops where id=p_id and user_id=owner_id;
 elsif p_operation='travel_stop_arrival' then
  select jsonb_build_object('id',id,'trip_id',trip_id,'trip_revision',(select t.mutation_revision from public.trips t where t.id=trip_id and t.user_id=owner_id and t.archived_at is null),'mutation_revision',mutation_revision,'arrived_at',arrived_at) into result from public.trip_stops where id=p_id and user_id=owner_id;
 elsif p_operation='travel_stop_order' then
  select jsonb_build_object('id',id,'trip_id',trip_id,'trip_revision',(select t.mutation_revision from public.trips t where t.id=trip_id and t.user_id=owner_id and t.archived_at is null),'mutation_revision',mutation_revision,'sort_order',sort_order) into result from public.trip_stops where id=p_id and user_id=owner_id;
 elsif p_operation='travel_next_stop' then
  select jsonb_build_object('id',id,'mutation_revision',mutation_revision,'current_stop_id',current_stop_id,'next_stop_id',next_stop_id) into result from public.trips where id=p_id and user_id=owner_id and archived_at is null;
 elsif p_operation='travel_document' then
  -- This projection also serves idempotent replay, whose definer bypasses RLS.
  -- Recheck the current endpoint before returning even a known relationship ID.
  perform 1 from public.documents where id=p_document_id and user_id=owner_id and vault_group_id is null for share;
  if not found then raise exception 'life_document_unavailable' using errcode='42501'; end if;
  select jsonb_build_object('id',id,'mutation_revision',mutation_revision,'document_id',p_document_id,'linked',exists(select 1 from public.trip_documents d where d.trip_id=p_id and d.document_id=p_document_id and d.user_id=owner_id and d.archived_at is null)) into result from public.trips where id=p_id and user_id=owner_id and archived_at is null;
 elsif p_operation='leisure_progress' then
  select jsonb_build_object('id',e.id,'mutation_revision',coalesce(f.revision,0),'progress_unit',f.progress_unit,'progress_value',f.progress_value,'progress_total',f.progress_total) into result from public.leisure_experiences e left join public.leisure_feedback f on f.experience_id=e.id and f.user_id=e.user_id where e.id=p_id and e.user_id=owner_id and e.archived_at is null;
 end if;
 if result is null or p_operation like 'travel_stop_%' and result->>'trip_revision' is null then raise exception 'life_missing' using errcode='42501'; end if;
 return result;
end; $$;

create function life_private.apply_fields(p_request_id uuid,p_operation text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); item jsonb; prior jsonb; saved jsonb; before_rows jsonb:='[]'; after_rows jsonb:='[]';
 ids uuid[]; target uuid; receipt_id uuid; request_hash text; existing public.workspace_action_receipts;
 allowed text[]; key text; purchase public.purchase_items; parent uuid; parent_ids uuid[]; stop_count integer;
begin
 if owner_id is null then raise exception 'life_unauthorized' using errcode='42501'; end if;
 if p_request_id is null or p_operation not in ('shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order','travel_next_stop','travel_document','leisure_progress') or p_operation is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'life_invalid'; end if;
 select array_agg((v->>'id')::uuid order by (v->>'id')::uuid) into ids from jsonb_array_elements(p_items) v;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) or array_position(ids,null) is not null then raise exception 'life_invalid'; end if;
 request_hash:=md5(p_operation||p_items::text);
 perform pg_advisory_xact_lock(hashtextextended('life:'||owner_id::text||':'||p_request_id::text,0));
 select * into existing from public.workspace_action_receipts where user_id=owner_id and request_id=p_request_id;
 if found then
  if existing.request_hash<>request_hash or existing.operation<>p_operation then raise exception 'life_request_conflict' using errcode='40001'; end if;
  for item in select v from jsonb_array_elements(existing.after_data->'items') v loop
   after_rows:=after_rows||jsonb_build_array(life_private.metadata(p_operation,(item->>'id')::uuid,(item->>'document_id')::uuid));
  end loop;
  return jsonb_build_object('rows',after_rows,'receiptId',existing.id,'duplicate',true);
 end if;
 -- Lock parent rows before stops, always by stable UUID order. Legacy stop inserts
 -- take this same trip lock, so concurrent additions cannot reuse a sort position.
 if p_operation like 'travel_stop_%' then
  select array_agg(distinct trip_id order by trip_id) into parent_ids from public.trip_stops where id=any(ids) and user_id=owner_id;
  perform 1 from public.trips where id=any(parent_ids) and user_id=owner_id and archived_at is null order by id for update;
  if (select count(*) from public.trip_stops s join public.trips t on t.id=s.trip_id where s.id=any(ids) and s.user_id=owner_id and t.user_id=owner_id and t.archived_at is null)<>cardinality(ids) then raise exception 'life_missing'; end if;
  perform 1 from public.trip_stops where id=any(ids) and user_id=owner_id order by id for update;
 elsif p_operation like 'shopping_%' then
  perform 1 from public.purchase_items where id=any(ids) and user_id=owner_id and archived_at is null order by id for update;
 elsif p_operation like 'travel_%' then
  perform 1 from public.trips where id=any(ids) and user_id=owner_id and archived_at is null order by id for update;
 else
  foreach target in array ids loop
   perform pg_advisory_xact_lock(hashtextextended('leisure:'||target::text,0));
   perform 1 from public.leisure_experiences where id=target and user_id=owner_id and archived_at is null for update;
   if not found then raise exception 'life_missing'; end if;
   perform 1 from public.leisure_feedback where experience_id=target and user_id=owner_id for update;
  end loop;
 end if;
 allowed:=case p_operation
  when 'shopping_quantity' then array['quantity','quantity_unit']
  when 'shopping_purchased' then array[]::text[]
  when 'travel_stop_metadata' then array['day_number','planned_time','duration_minutes']
  when 'travel_stop_arrival' then array['arrived']
  when 'travel_stop_order' then array['sort_order']
  when 'travel_next_stop' then array['current_stop_id','next_stop_id']
  when 'travel_document' then array['document_id','linked']
  else array['progress_unit','progress_value','progress_total'] end || array['id','expected_revision'];
 -- Validate all records first. Any later constraint/audit/receipt failure rolls
 -- the entire transaction back; there is no partial optimistic success.
 for item in select v from jsonb_array_elements(p_items) v order by (v->>'id')::uuid loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['id','expected_revision']) or (item->>'expected_revision') !~ '^\d+$' then raise exception 'life_invalid'; end if;
  for key in select jsonb_object_keys(item) loop if not(key=any(allowed)) then raise exception 'life_invalid'; end if; end loop;
  target:=(item->>'id')::uuid;
  prior:=life_private.metadata(p_operation,target,(item->>'document_id')::uuid);
  if (prior->>'mutation_revision')::bigint<>(item->>'expected_revision')::bigint then raise exception 'life_conflict' using errcode='40001'; end if;
  before_rows:=before_rows||jsonb_build_array(prior);
  if p_operation='shopping_quantity' then
   if not(item ?& array['quantity','quantity_unit']) or not((item->'quantity'='null'::jsonb and item->'quantity_unit'='null'::jsonb) or (jsonb_typeof(item->'quantity')='string' and (item->>'quantity') ~ '^\d{1,9}(\.\d{1,3})?$' and (item->>'quantity')::numeric>0 and jsonb_typeof(item->'quantity_unit')='string' and char_length(btrim(item->>'quantity_unit')) between 1 and 24)) then raise exception 'life_invalid'; end if;
  elsif p_operation='shopping_purchased' then
   select * into purchase from public.purchase_items where id=target and user_id=owner_id;
   if purchase.status not in ('ready','cooling') or purchase.status='cooling' and (purchase.cooldown_until is null or purchase.cooldown_until>now()) then raise exception 'life_purchase_not_ready'; end if;
  elsif p_operation='travel_stop_metadata' then
   if not(item ?& array['day_number','planned_time','duration_minutes']) or item->>'day_number' is not null and ((item->>'day_number') !~ '^\d+$' or (item->>'day_number')::integer not between 1 and 366) or item->>'duration_minutes' is not null and ((item->>'duration_minutes') !~ '^\d+$' or (item->>'duration_minutes')::integer not between 1 and 10080) or item->>'planned_time' is not null and (item->>'planned_time') !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' then raise exception 'life_invalid'; end if;
  elsif p_operation='travel_stop_arrival' then
   if jsonb_typeof(item->'arrived') is distinct from 'boolean' then raise exception 'life_invalid'; end if;
  elsif p_operation='travel_stop_order' then
   if (item->>'sort_order') is null or (item->>'sort_order') !~ '^\d+$' or (item->>'sort_order')::bigint>1000000 then raise exception 'life_invalid'; end if;
  elsif p_operation='travel_next_stop' then
   if not(item ?& array['current_stop_id','next_stop_id']) then raise exception 'life_invalid'; end if;
   for parent in select v::uuid from jsonb_array_elements_text(jsonb_build_array(item->'current_stop_id',item->'next_stop_id')) v where v is not null loop
    perform 1 from public.trip_stops where id=parent and trip_id=target and user_id=owner_id for share;
    if not found then raise exception 'life_missing'; end if;
   end loop;
  elsif p_operation='travel_document' then
   if jsonb_typeof(item->'linked') is distinct from 'boolean' or item->>'document_id' is null then raise exception 'life_invalid'; end if;
   perform 1 from public.documents where id=(item->>'document_id')::uuid and user_id=owner_id and vault_group_id is null and (not (item->>'linked')::boolean or archived_at is null and storage_state='available' and storage_provider='cloudflare_r2') for share;
   if not found then raise exception 'life_document_unavailable'; end if;
  else
   if not(item ?& array['progress_unit','progress_value','progress_total']) or not((item->'progress_unit'='null'::jsonb and item->'progress_value'='null'::jsonb and item->'progress_total'='null'::jsonb) or (item->>'progress_unit' in ('page','episode','minute') and (item->>'progress_value') ~ '^\d+$' and (item->>'progress_value')::integer between 0 and 1000000 and (item->'progress_total'='null'::jsonb or (item->>'progress_total') ~ '^\d+$' and (item->>'progress_total')::integer between 1 and 1000000 and (item->>'progress_value')::integer<=(item->>'progress_total')::integer))) then raise exception 'life_invalid'; end if;
  end if;
 end loop;
 if p_operation='travel_stop_order' then
  if cardinality(parent_ids)<>1 or (select count(distinct coalesce(day_number,0)) from public.trip_stops where id=any(ids))<>1 or (select count(distinct sort_order) from public.trip_stops where id=any(ids))<>cardinality(ids) or (select count(distinct v->>'sort_order') from jsonb_array_elements(p_items) v)<>cardinality(ids) or exists(select 1 from jsonb_array_elements(p_items) v where not exists(select 1 from public.trip_stops s where s.id=any(ids) and s.sort_order=(v->>'sort_order')::integer)) then raise exception 'life_invalid_order'; end if;
 end if;
 for item in select v from jsonb_array_elements(p_items) v order by (v->>'id')::uuid loop
  target:=(item->>'id')::uuid;
  if p_operation='shopping_quantity' then update public.purchase_items set quantity=item->>'quantity',quantity_unit=nullif(btrim(item->>'quantity_unit'),'') where id=target and user_id=owner_id;
  elsif p_operation='shopping_purchased' then update public.purchase_items set status='purchased',purchased_at=now(),cooldown_until=null where id=target and user_id=owner_id;
  elsif p_operation='travel_stop_metadata' then update public.trip_stops set day_number=(item->>'day_number')::integer,planned_time=(item->>'planned_time')::time,duration_minutes=(item->>'duration_minutes')::integer where id=target and user_id=owner_id;
  elsif p_operation='travel_stop_arrival' then update public.trip_stops set arrived_at=case when (item->>'arrived')::boolean then now() else null end where id=target and user_id=owner_id;
  elsif p_operation='travel_stop_order' then update public.trip_stops set sort_order=(item->>'sort_order')::integer where id=target and user_id=owner_id;
  elsif p_operation='travel_next_stop' then update public.trips set current_stop_id=(item->>'current_stop_id')::uuid,next_stop_id=(item->>'next_stop_id')::uuid where id=target and user_id=owner_id;
  elsif p_operation='travel_document' then
   insert into public.trip_documents(user_id,trip_id,document_id,archived_at) values(owner_id,target,(item->>'document_id')::uuid,case when (item->>'linked')::boolean then null else now() end) on conflict(trip_id,document_id) do update set archived_at=excluded.archived_at,updated_at=now();
   update public.trips set updated_at=now() where id=target and user_id=owner_id;
  else
   insert into public.leisure_feedback(experience_id,user_id,progress_unit,progress_value,progress_total) values(target,owner_id,item->>'progress_unit',(item->>'progress_value')::integer,(item->>'progress_total')::integer)
   on conflict(experience_id) do update set progress_unit=excluded.progress_unit,progress_value=excluded.progress_value,progress_total=excluded.progress_total,updated_at=now();
  end if;
 end loop;
 for item in select v from jsonb_array_elements(p_items) v order by (v->>'id')::uuid loop
  saved:=life_private.metadata(p_operation,(item->>'id')::uuid,(item->>'document_id')::uuid);
  after_rows:=after_rows||jsonb_build_array(saved);
 end loop;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,before_data,after_data) values(owner_id,p_operation,'life_metadata',ids[1],'user',jsonb_build_object('items',before_rows),jsonb_build_object('items',after_rows));
 receipt_id:=public._record_workbench_receipt(owner_id,p_request_id,request_hash,p_operation,ids[1],jsonb_build_object('items',before_rows),jsonb_build_object('items',after_rows),0);
 return jsonb_build_object('rows',after_rows,'receiptId',receipt_id,'duplicate',false);
end; $$;
create function public.apply_life_field_operation(p_request_id uuid,p_operation text,p_items jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select life_private.apply_fields(p_request_id,p_operation,p_items); $$;

-- Only the authenticated undo dispatcher can invoke this internal capability.
create function public._undo_life_field_operation(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.workspace_action_receipts; item jsonb; current_meta jsonb; prior jsonb; owner_id uuid:=auth.uid();
 operation text; target uuid; doc uuid; after_rows jsonb:='[]'; ids uuid[]; parent_ids uuid[];
begin
 select * into receipt from public.workspace_action_receipts where id=p_receipt_id and user_id=owner_id for update;
 if not found then raise exception 'life_missing'; end if;
 if receipt.operation='travel_document' and exists(select 1 from jsonb_array_elements(receipt.after_data->'items') v left join public.documents d on d.id=(v->>'document_id')::uuid and d.user_id=owner_id where d.id is null or d.vault_group_id is not null) then raise exception 'life_missing' using errcode='42501'; end if;
 if receipt.status='undone' then return jsonb_build_object('status','undone','duplicate',true); end if;
 if receipt.status<>'available' or receipt.expires_at<=now() then raise exception 'life_undo_expired'; end if;
 operation:=receipt.operation;
 if operation not in ('shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order','travel_next_stop','travel_document','leisure_progress') then raise exception 'life_invalid'; end if;
 select array_agg((v->>'id')::uuid order by (v->>'id')::uuid) into ids from jsonb_array_elements(receipt.after_data->'items') v;
 if operation like 'travel_stop_%' then
  select array_agg(distinct trip_id order by trip_id) into parent_ids from public.trip_stops where id=any(ids) and user_id=owner_id;
  perform 1 from public.trips where id=any(parent_ids) and user_id=owner_id and archived_at is null order by id for update;
  perform 1 from public.trip_stops where id=any(ids) and user_id=owner_id order by id for update;
 elsif operation like 'shopping_%' then perform 1 from public.purchase_items where id=any(ids) and user_id=owner_id order by id for update;
 elsif operation like 'travel_%' then perform 1 from public.trips where id=any(ids) and user_id=owner_id and archived_at is null order by id for update;
 else
  foreach target in array ids loop
   perform pg_advisory_xact_lock(hashtextextended('leisure:'||target::text,0));
   perform 1 from public.leisure_experiences where id=target and user_id=owner_id and archived_at is null for update;
   perform 1 from public.leisure_feedback where experience_id=target and user_id=owner_id for update;
  end loop;
 end if;
 for item in select v from jsonb_array_elements(receipt.after_data->'items') v loop
  current_meta:=life_private.metadata(operation,(item->>'id')::uuid,(item->>'document_id')::uuid);
  if current_meta is distinct from item then raise exception 'life_undo_conflict' using errcode='40001'; end if;
 end loop;
 for prior in select v from jsonb_array_elements(receipt.before_data->'items') v order by (v->>'id')::uuid loop
  target:=(prior->>'id')::uuid; doc:=(prior->>'document_id')::uuid;
  if operation='shopping_quantity' then update public.purchase_items set quantity=prior->>'quantity',quantity_unit=prior->>'quantity_unit' where id=target and user_id=owner_id;
  elsif operation='shopping_purchased' then update public.purchase_items set status=prior->>'status',purchased_at=(prior->>'purchased_at')::timestamptz,cooldown_until=(prior->>'cooldown_until')::timestamptz where id=target and user_id=owner_id;
  elsif operation='travel_stop_metadata' then update public.trip_stops set day_number=(prior->>'day_number')::integer,planned_time=(prior->>'planned_time')::time,duration_minutes=(prior->>'duration_minutes')::integer where id=target and user_id=owner_id;
  elsif operation='travel_stop_arrival' then update public.trip_stops set arrived_at=(prior->>'arrived_at')::timestamptz where id=target and user_id=owner_id;
  elsif operation='travel_stop_order' then update public.trip_stops set sort_order=(prior->>'sort_order')::integer where id=target and user_id=owner_id;
  elsif operation='travel_next_stop' then update public.trips set current_stop_id=(prior->>'current_stop_id')::uuid,next_stop_id=(prior->>'next_stop_id')::uuid where id=target and user_id=owner_id;
  elsif operation='travel_document' then
   if (prior->>'linked')::boolean then perform 1 from public.documents where id=doc and user_id=owner_id and archived_at is null and vault_group_id is null and storage_state='available' and storage_provider='cloudflare_r2' for share; if not found then raise exception 'life_document_unavailable'; end if; end if;
   update public.trip_documents set archived_at=case when (prior->>'linked')::boolean then null else now() end,updated_at=now() where trip_id=target and document_id=doc and user_id=owner_id;
   update public.trips set updated_at=now() where id=target and user_id=owner_id;
  else update public.leisure_feedback set progress_unit=prior->>'progress_unit',progress_value=(prior->>'progress_value')::integer,progress_total=(prior->>'progress_total')::integer,updated_at=now() where experience_id=target and user_id=owner_id;
  end if;
  after_rows:=after_rows||jsonb_build_array(life_private.metadata(operation,target,doc));
 end loop;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(owner_id,'undo_'||operation,'life_metadata',receipt.target_id,'user',jsonb_build_object('receipt_id',receipt.id,'items',after_rows));
 update public.workspace_action_receipts set status='undone',undone_at=now() where id=receipt.id;
 return jsonb_build_object('status','undone','rows',after_rows);
end; $$;

-- Concurrent legacy additions take the parent lock and use MAX, not COUNT.
create function life_private.assign_stop_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.trips where id=new.trip_id and user_id=new.user_id and archived_at is null for update;
 if not found or auth.uid() is not null and auth.uid() is distinct from new.user_id then raise exception 'life_missing'; end if;
 select coalesce(max(sort_order),-1)+1 into new.sort_order from public.trip_stops where trip_id=new.trip_id;
 return new;
end; $$;
create trigger trip_stop_serial_order before insert on public.trip_stops for each row execute function life_private.assign_stop_order();
create function life_private.advance_stop_parent() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_ids uuid[];
begin
 if tg_op='INSERT' then parent_ids:=array[new.trip_id]; elsif tg_op='DELETE' then parent_ids:=array[old.trip_id]; else parent_ids:=array[old.trip_id,new.trip_id]; end if;
 perform 1 from public.trips where id=any(parent_ids) order by id for update;
 update public.trips set updated_at=now() where id=any(parent_ids);
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger trip_stop_parent_revision after insert or update or delete on public.trip_stops for each row execute function life_private.advance_stop_parent();
revoke all on all functions in schema life_private from public,anon,authenticated,service_role;
grant execute on function life_private.apply_fields(uuid,text,jsonb) to authenticated;
revoke all on function public.apply_life_field_operation(uuid,text,jsonb), public._undo_life_field_operation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_life_field_operation(uuid,text,jsonb) to authenticated;

-- Undo notifications carry only this opaque ID. Reconcile against live owned
-- rows, never against browser payloads or the stored historical after snapshot.
create function life_private.read_receipt_state(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.workspace_action_receipts; item jsonb; rows jsonb:='[]'; owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'life_unauthorized' using errcode='42501'; end if;
 select * into receipt from public.workspace_action_receipts where id=p_receipt_id and user_id=owner_id;
 if not found or receipt.operation not in ('shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order','travel_next_stop','travel_document','leisure_progress') then raise exception 'life_missing'; end if;
 if receipt.operation='travel_document' and exists(select 1 from jsonb_array_elements(receipt.after_data->'items') v left join public.documents d on d.id=(v->>'document_id')::uuid and d.user_id=owner_id where d.id is null or d.vault_group_id is not null) then raise exception 'life_missing' using errcode='42501'; end if;
 for item in select v from jsonb_array_elements(receipt.after_data->'items') v loop
  rows:=rows||jsonb_build_array(life_private.metadata(receipt.operation,(item->>'id')::uuid,(item->>'document_id')::uuid));
 end loop;
 return jsonb_build_object('operation',receipt.operation,'rows',rows);
end; $$;
create function public.read_life_receipt_state(p_receipt_id uuid) returns jsonb language sql security invoker set search_path='' as $$select life_private.read_receipt_state(p_receipt_id);$$;
revoke all on function life_private.read_receipt_state(uuid),public.read_life_receipt_state(uuid) from public,anon,authenticated,service_role;
grant execute on function life_private.read_receipt_state(uuid),public.read_life_receipt_state(uuid) to authenticated;
