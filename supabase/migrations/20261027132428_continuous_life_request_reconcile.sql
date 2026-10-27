-- Pure reconciliation of the exact frozen Life intent. No claim, retry, repair,
-- receipt mutation, or business write is performed by this read boundary.
create function life_private.valid_request_items(p_operation text,p_items jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; k text; allowed text[]; amount numeric; a jsonb; b jsonb; c jsonb;
begin
 if p_operation is null or p_items is null or p_operation not in ('shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order','travel_next_stop','travel_document','leisure_progress') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20 then return false;end if;
 if (select count(*)<>count(distinct v->>'id') from jsonb_array_elements(p_items) v) then return false;end if;
 allowed:=array['id','expected_revision']||case p_operation when 'shopping_quantity' then array['quantity','quantity_unit'] when 'shopping_purchased' then '{}'::text[] when 'travel_stop_metadata' then array['day_number','planned_time','duration_minutes'] when 'travel_stop_arrival' then array['arrived'] when 'travel_stop_order' then array['sort_order'] when 'travel_next_stop' then array['current_stop_id','next_stop_id'] when 'travel_document' then array['document_id','linked'] else array['progress_unit','progress_value','progress_total'] end;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>cardinality(allowed) then return false;end if;
  for k in select jsonb_object_keys(item) loop if not k=any(allowed) then return false;end if;end loop;
  if jsonb_typeof(item->'id')<>'string' or not public.workbench_uuid_text(item->>'id') or jsonb_typeof(item->'expected_revision')<>'number' then return false;end if;
  amount:=(item->>'expected_revision')::numeric;if amount<>trunc(amount) or amount<0 or amount>9007199254740990 then return false;end if;
  if p_operation='shopping_quantity' then
   a:=item->'quantity';b:=item->'quantity_unit';
   if a='null'::jsonb then if b<>'null'::jsonb then return false;end if;
   elsif jsonb_typeof(a)<>'string' or a#>>'{}' !~ '^\d{1,9}(\.\d{1,3})?$' or (a#>>'{}')::numeric<=0 or jsonb_typeof(b)<>'string' or public.workbench_utf16_length(btrim(b#>>'{}')) not between 1 and 24 then return false;end if;
  elsif p_operation='travel_stop_metadata' then
   for k in select unnest(array['day_number','duration_minutes']) loop a:=item->k;if a<>'null'::jsonb then if jsonb_typeof(a)<>'number' then return false;end if;amount:=(a#>>'{}')::numeric;if amount<>trunc(amount) or amount<1 or amount>(case when k='day_number' then 366 else 10080 end) then return false;end if;end if;end loop;
   a:=item->'planned_time';if a<>'null'::jsonb and (jsonb_typeof(a)<>'string' or a#>>'{}' !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$') then return false;end if;
  elsif p_operation='travel_stop_arrival' then if jsonb_typeof(item->'arrived')<>'boolean' then return false;end if;
  elsif p_operation='travel_stop_order' then if jsonb_typeof(item->'sort_order')<>'number' then return false;end if;amount:=(item->>'sort_order')::numeric;if amount<>trunc(amount) or amount<0 or amount>1000000 then return false;end if;
  elsif p_operation='travel_next_stop' then for k in select unnest(array['current_stop_id','next_stop_id']) loop a:=item->k;if a<>'null'::jsonb and (jsonb_typeof(a)<>'string' or not public.workbench_uuid_text(a#>>'{}')) then return false;end if;end loop;
  elsif p_operation='travel_document' then if jsonb_typeof(item->'document_id')<>'string' or not public.workbench_uuid_text(item->>'document_id') or jsonb_typeof(item->'linked')<>'boolean' then return false;end if;
  elsif p_operation='leisure_progress' then
   a:=item->'progress_unit';b:=item->'progress_value';c:=item->'progress_total';
   if a='null'::jsonb then if b<>'null'::jsonb or c<>'null'::jsonb then return false;end if;
   else
    if jsonb_typeof(a)<>'string' or a#>>'{}' not in ('page','episode','minute') or jsonb_typeof(b)<>'number' then return false;end if;
    amount:=(b#>>'{}')::numeric;if amount<>trunc(amount) or amount<0 or amount>1000000 then return false;end if;
    if c<>'null'::jsonb then if jsonb_typeof(c)<>'number' or (c#>>'{}')::numeric<>trunc((c#>>'{}')::numeric) or (c#>>'{}')::numeric not between 1 and 1000000 or amount>(c#>>'{}')::numeric then return false;end if;end if;
  end if; -- nullable leisure progress fields
  end if; -- operation dispatch
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function life_private.valid_request_items(text,jsonb) from public,anon,authenticated,service_role;

create function public.read_life_request_outcome(p_request_id uuid,p_operation text,p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); receipt public.workspace_action_receipts; current_state jsonb; item jsonb; row_data jsonb; rows jsonb:='[]';
begin
 if owner_id is null then raise exception 'life_unauthorized' using errcode='42501';end if;
 if p_request_id is null or not life_private.valid_request_items(p_operation,p_items) then return jsonb_build_object('status','rejected','code','invalid');end if;
 select * into receipt from public.workspace_action_receipts where user_id=owner_id and request_id=p_request_id;
 if not found then return jsonb_build_object('status','missing');end if;
 if receipt.operation<>p_operation or receipt.request_hash<>md5(p_operation||p_items::text) then return jsonb_build_object('status','rejected','code','conflict');end if;
 if not public._workbench_receipt_visible(owner_id,receipt.operation,receipt.target_id,receipt.before_data,receipt.after_data) then return jsonb_build_object('status','missing');end if;
 if receipt.status in ('conflict','failed') then return jsonb_build_object('status','rejected','code','conflict');end if;
 if receipt.status not in ('available','undone') then return jsonb_build_object('status','needs-check');end if;
 if p_operation='travel_document' then
  -- Existing by-receipt reader takes a document share lock. This new reader is
  -- valid in a read-only transaction and performs the same owner/Vault checks.
  for item in select value from jsonb_array_elements(receipt.after_data->'items') loop
   if not exists(select 1 from public.documents where id=(item->>'document_id')::uuid and user_id=owner_id and vault_group_id is null) then return jsonb_build_object('status','missing');end if;
   select jsonb_build_object('id',t.id,'mutation_revision',t.mutation_revision,'document_id',item->>'document_id','linked',exists(select 1 from public.trip_documents d where d.trip_id=t.id and d.document_id=(item->>'document_id')::uuid and d.user_id=owner_id and d.archived_at is null)) into row_data from public.trips t where t.id=(item->>'id')::uuid and t.user_id=owner_id and t.archived_at is null;
   if row_data is null then return jsonb_build_object('status','missing');end if;rows:=rows||jsonb_build_array(row_data);
  end loop;
  current_state:=jsonb_build_object('operation',p_operation,'rows',rows);
 else current_state:=life_private.read_receipt_state(receipt.id);end if;
 return current_state||jsonb_build_object('status','saved','receiptId',receipt.id,'receiptStatus',receipt.status);
exception when sqlstate '42501' then return jsonb_build_object('status','missing');
end $$;
revoke all on function public.read_life_request_outcome(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_life_request_outcome(uuid,text,jsonb) to authenticated;
