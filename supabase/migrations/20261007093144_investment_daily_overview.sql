-- Additive investment daily overview. No data seeds, price feed, or brokerage access.
begin;
create table public.investment_cash_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  account_id uuid not null, sequence integer not null,
  kind text not null check(kind in ('opening','deposit','withdrawal','dividend','fee','void')),
  void_entry_id uuid, symbol text,
  occurred_on date not null,
  amount text not null check(amount ~ '^\d{1,12}(\.\d{1,8})?$'),
  tax text not null default '0' check(tax ~ '^\d{1,12}(\.\d{1,8})?$'),
  fees text not null default '0' check(fees ~ '^\d{1,12}(\.\d{1,8})?$'),
  source text not null check(char_length(btrim(source)) between 1 and 500),
  import_key uuid not null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check(archived_at is null),
  check(kind in ('opening','void') or amount::numeric > 0),
  check((kind='dividend' and symbol is not null and symbol ~ '^[A-Z0-9][A-Z0-9.:-]{0,39}$' and tax::numeric+fees::numeric<=amount::numeric) or (kind<>'dividend' and symbol is null and tax::numeric=0 and fees::numeric=0)),
  check((kind='void' and void_entry_id is not null and amount::numeric=0) or (kind<>'void' and void_entry_id is null)),
  unique(id,user_id), unique(user_id,import_key), unique(account_id,sequence), unique(account_id,void_entry_id),
  foreign key(account_id,user_id) references public.investment_accounts(id,user_id),
  foreign key(void_entry_id,user_id) references public.investment_cash_ledger(id,user_id)
);
create table public.investment_quotes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  account_id uuid not null, sequence integer not null,
  symbol text not null check(symbol ~ '^[A-Z0-9][A-Z0-9.:-]{0,39}$'),
  currency text not null check(currency in ('CNY','USD','HKD')),
  price text not null check(price ~ '^\d{1,12}(\.\d{1,8})?$'),
  as_of timestamptz not null, source_kind text not null check(source_kind in ('manual','imported')),
  source text not null check(char_length(btrim(source)) between 1 and 500), import_key uuid not null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check(archived_at is null), unique(user_id,import_key), unique(account_id,sequence),
  foreign key(account_id,user_id) references public.investment_accounts(id,user_id)
);
create index investment_cash_owner_account on public.investment_cash_ledger(user_id,account_id,occurred_on,sequence);
create index investment_cash_account_owner on public.investment_cash_ledger(account_id,user_id);
create index investment_cash_void_owner on public.investment_cash_ledger(void_entry_id,user_id) where void_entry_id is not null;
create index investment_quote_owner_account on public.investment_quotes(user_id,account_id,symbol,as_of desc,sequence desc);
create index investment_quote_account_owner on public.investment_quotes(account_id,user_id);
alter table public.investment_cash_ledger enable row level security;
alter table public.investment_quotes enable row level security;
revoke all on public.investment_cash_ledger,public.investment_quotes from public,anon,authenticated;
grant select,insert on public.investment_cash_ledger,public.investment_quotes to authenticated;
create policy investment_cash_select on public.investment_cash_ledger for select to authenticated using((select auth.uid())=user_id);
create policy investment_cash_insert on public.investment_cash_ledger for insert to authenticated with check((select auth.uid())=user_id);
create policy investment_quote_select on public.investment_quotes for select to authenticated using((select auth.uid())=user_id);
create policy investment_quote_insert on public.investment_quotes for insert to authenticated with check((select auth.uid())=user_id);

create function public.validate_investment_daily_insert() returns trigger language plpgsql security invoker set search_path='' as $$
declare account public.investment_accounts; target public.investment_cash_ledger; opening_date date;
begin
  if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'not authorized' using errcode='42501'; end if;
  select * into account from public.investment_accounts where id=new.account_id and user_id=auth.uid() and archived_at is null for update;
  if not found then raise exception 'account unavailable' using errcode='42501'; end if;
  new.sequence:=account.revision+1;
  if tg_table_name='investment_quotes' then
    if new.currency<>account.currency or new.as_of>now() or not isfinite(new.as_of) then raise exception 'quote currency or time mismatch' using errcode='23514'; end if;
  else
    if new.occurred_on>(now() at time zone 'UTC')::date or not isfinite(new.occurred_on) then raise exception 'future cash event' using errcode='23514'; end if;
    if new.kind='void' then
      select * into target from public.investment_cash_ledger where id=new.void_entry_id and account_id=new.account_id and user_id=auth.uid();
      if not found or target.kind='void' or exists(select 1 from public.investment_cash_ledger where void_entry_id=target.id) then raise exception 'invalid cash correction' using errcode='23514'; end if;
      new.occurred_on:=target.occurred_on;
    else
      select occurred_on into opening_date from public.investment_cash_ledger e where e.account_id=new.account_id and e.kind='opening' and not exists(select 1 from public.investment_cash_ledger v where v.void_entry_id=e.id);
      if new.kind='opening' then
        if opening_date is not null or exists(select 1 from public.investment_cash_ledger e where e.account_id=new.account_id and e.kind<>'void' and e.occurred_on<new.occurred_on and not exists(select 1 from public.investment_cash_ledger v where v.void_entry_id=e.id)) or exists(select 1 from public.investment_ledger e where e.account_id=new.account_id and e.kind in ('buy','sell') and e.occurred_on<new.occurred_on and not exists(select 1 from public.investment_ledger v where v.void_entry_id=e.id)) then raise exception 'opening must precede recorded cash movements and trades' using errcode='23514'; end if;
      elsif opening_date is not null and new.occurred_on<opening_date then raise exception 'cash event before opening' using errcode='23514'; end if;
    end if;
  end if;
  update public.investment_accounts set revision=new.sequence,updated_at=now() where id=new.account_id and user_id=auth.uid();
  return new;
end;
$$;
create trigger investment_cash_validate before insert on public.investment_cash_ledger for each row execute function public.validate_investment_daily_insert();
create trigger investment_quote_validate before insert on public.investment_quotes for each row execute function public.validate_investment_daily_insert();

create function public.audit_investment_daily_insert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'not authorized' using errcode='42501'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),case when tg_table_name='investment_quotes' then 'investment_quote_append' else 'investment_cash_append' end,tg_table_name,new.id,'user',jsonb_build_object('account_id',new.account_id,'sequence',new.sequence));
  return new;
end;
$$;
create trigger investment_cash_audit after insert on public.investment_cash_ledger for each row execute function public.audit_investment_daily_insert();
create trigger investment_quote_audit after insert on public.investment_quotes for each row execute function public.audit_investment_daily_insert();

create function public.append_investment_cash(p_account_id uuid,p_entry jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.investment_cash_ledger; inserted_id uuid; expected_date date;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from public.investment_accounts where id=p_account_id and user_id=auth.uid() and archived_at is null for update;
  if not found then raise exception 'account unavailable' using errcode='42501'; end if;
  if jsonb_typeof(p_entry) is distinct from 'object' or (p_entry-array['kind','void_entry_id','symbol','occurred_on','amount','tax','fees','source','import_key'])<>'{}'::jsonb then raise exception 'invalid cash envelope' using errcode='23514'; end if;
  expected_date:=(p_entry->>'occurred_on')::date;
  if p_entry->>'kind'='void' then
    select occurred_on into expected_date from public.investment_cash_ledger where id=(p_entry->>'void_entry_id')::uuid and account_id=p_account_id and user_id=auth.uid();
    if not found then raise exception 'correction target unavailable' using errcode='23514'; end if;
  end if;
  select * into prior from public.investment_cash_ledger where user_id=auth.uid() and import_key=(p_entry->>'import_key')::uuid;
  if found then
    if prior.account_id<>p_account_id or jsonb_build_object('kind',prior.kind,'void_entry_id',prior.void_entry_id,'symbol',prior.symbol,'occurred_on',prior.occurred_on,'amount',prior.amount,'tax',prior.tax,'fees',prior.fees,'source',prior.source)<>jsonb_build_object('kind',p_entry->>'kind','void_entry_id',(p_entry->>'void_entry_id')::uuid,'symbol',p_entry->>'symbol','occurred_on',expected_date,'amount',p_entry->>'amount','tax',p_entry->>'tax','fees',p_entry->>'fees','source',p_entry->>'source') then raise exception 'import conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.id,'duplicate',true);
  end if;
  insert into public.investment_cash_ledger(user_id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,amount,tax,fees,source,import_key) values(auth.uid(),p_account_id,0,p_entry->>'kind',(p_entry->>'void_entry_id')::uuid,p_entry->>'symbol',expected_date,p_entry->>'amount',p_entry->>'tax',p_entry->>'fees',p_entry->>'source',(p_entry->>'import_key')::uuid) returning id into inserted_id;
  return jsonb_build_object('id',inserted_id,'duplicate',false);
end;
$$;

create function public.append_investment_quotes(p_account_id uuid,p_quotes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare quote jsonb; prior public.investment_quotes; inserted_count integer:=0;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from public.investment_accounts where id=p_account_id and user_id=auth.uid() and archived_at is null for update;
  if not found then raise exception 'account unavailable' using errcode='42501'; end if;
  if jsonb_typeof(p_quotes) is distinct from 'array' or jsonb_array_length(p_quotes) not between 1 and 100 then raise exception 'invalid quote batch' using errcode='23514'; end if;
  for quote in select value from jsonb_array_elements(p_quotes) loop
    if jsonb_typeof(quote) is distinct from 'object' or (quote-array['symbol','currency','price','as_of','source_kind','source','import_key'])<>'{}'::jsonb then raise exception 'invalid quote envelope' using errcode='23514'; end if;
    if (quote->>'as_of') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'quote timezone required' using errcode='23514'; end if;
    select * into prior from public.investment_quotes where user_id=auth.uid() and import_key=(quote->>'import_key')::uuid;
    if found then
      if prior.account_id<>p_account_id or jsonb_build_object('symbol',prior.symbol,'currency',prior.currency,'price',prior.price,'as_of',prior.as_of,'source_kind',prior.source_kind,'source',prior.source)<>jsonb_build_object('symbol',quote->>'symbol','currency',quote->>'currency','price',quote->>'price','as_of',(quote->>'as_of')::timestamptz,'source_kind',quote->>'source_kind','source',quote->>'source') then raise exception 'quote import conflict' using errcode='23505'; end if;
    else
      insert into public.investment_quotes(user_id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key) values(auth.uid(),p_account_id,0,quote->>'symbol',quote->>'currency',quote->>'price',(quote->>'as_of')::timestamptz,quote->>'source_kind',quote->>'source',(quote->>'import_key')::uuid);
      inserted_count:=inserted_count+1;
    end if;
  end loop;
  return jsonb_build_object('inserted',inserted_count,'duplicate',inserted_count=0);
end;
$$;
revoke all on function public.validate_investment_daily_insert(),public.audit_investment_daily_insert(),public.append_investment_cash(uuid,jsonb),public.append_investment_quotes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.append_investment_cash(uuid,jsonb),public.append_investment_quotes(uuid,jsonb) to authenticated;
commit;
