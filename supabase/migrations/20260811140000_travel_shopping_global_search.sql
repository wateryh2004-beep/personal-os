alter table public.search_documents drop constraint if exists search_documents_domain_check;
alter table public.search_documents add constraint search_documents_domain_check check (domain in ('notes','career','files','tasks','calendar','reviews','projects','shopping','travel'));

create or replace function public.sync_life_search_document() returns trigger
language plpgsql set search_path = public as $$
declare row_data jsonb; row_id uuid; owner_id uuid; entity_type_value text; domain_value text; title_value text; subtitle_value text := ''; content_value text := ''; metadata_value jsonb := '{}'::jsonb; updated_value timestamptz;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := (row_data->>'id')::uuid; owner_id := (row_data->>'user_id')::uuid;
  if tg_table_name = 'purchase_items' then
    entity_type_value := 'purchase_item'; domain_value := 'shopping'; title_value := row_data->>'title'; subtitle_value := coalesce(row_data->>'status',''); content_value := concat_ws(' ',row_data->>'category',row_data->>'reason_to_buy',row_data->>'existing_alternative',row_data->>'expected_usage',row_data->>'notes_markdown');
    if tg_op = 'DELETE' or coalesce(row_data->>'archived_at','') <> '' or coalesce(row_data->>'status','') in ('archived','abandoned') then delete from public.search_documents where user_id = owner_id and entity_type = entity_type_value and entity_id = row_id; if tg_op = 'DELETE' then return old; else return new; end if; end if;
  elsif tg_table_name = 'trips' then
    entity_type_value := 'trip'; domain_value := 'travel'; title_value := row_data->>'title'; subtitle_value := concat_ws(' · ',row_data->>'destination_label',row_data->>'status'); content_value := concat_ws(' ',row_data->>'description',row_data->>'notes_markdown',row_data->>'region',row_data->>'country_code');
    if tg_op = 'DELETE' or coalesce(row_data->>'archived_at','') <> '' then delete from public.search_documents where user_id = owner_id and entity_type = entity_type_value and entity_id = row_id; if tg_op = 'DELETE' then return old; else return new; end if; end if;
  else if tg_op = 'DELETE' then return old; else return new; end if; end if;
  updated_value := coalesce((row_data->>'updated_at')::timestamptz, now());
  insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
  values(owner_id,domain_value,entity_type_value,row_id,coalesce(title_value,''),coalesce(subtitle_value,''),coalesce(content_value,''),metadata_value,updated_value)
  on conflict(user_id,entity_type,entity_id) do update set title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,metadata=excluded.metadata,source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end $$;

create trigger search_purchase_items after insert or update or delete on public.purchase_items for each row execute procedure public.sync_life_search_document();
create trigger search_trips after insert or update or delete on public.trips for each row execute procedure public.sync_life_search_document();

insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at)
select user_id,'shopping','purchase_item',id,title,status,concat_ws(' ',category,reason_to_buy,existing_alternative,expected_usage,notes_markdown),updated_at from public.purchase_items where archived_at is null and status not in ('archived','abandoned')
on conflict(user_id,entity_type,entity_id) do update set title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,source_updated_at=excluded.source_updated_at,updated_at=now();
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at)
select user_id,'travel','trip',id,title,concat_ws(' · ',destination_label,status),concat_ws(' ',description,notes_markdown,region,country_code),updated_at from public.trips where archived_at is null
on conflict(user_id,entity_type,entity_id) do update set title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,source_updated_at=excluded.source_updated_at,updated_at=now();
