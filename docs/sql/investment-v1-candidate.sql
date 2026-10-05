-- Reviewed reference SQL; formal CLI-generated migrations live in supabase/migrations.
-- Production setup was explicitly approved; see the formal migration history and rollout notes.
-- New owner-scoped records only; no changes to existing policies or credentials.
begin;
create table public.investment_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  mode text not null check (mode in ('real','paper')),
  currency text not null check (currency in ('CNY','USD','HKD')),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (id,user_id), unique (user_id,mode,name)
);
create table public.investment_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  account_id uuid not null, sequence integer not null,
  kind text not null check (kind in ('opening','buy','sell','void')),
  void_entry_id uuid,
  symbol text not null check (symbol ~ '^[A-Z0-9][A-Z0-9.:-]{0,39}$'),
  occurred_on date not null,
  -- Decimal strings avoid JSON / JS floating-point loss across the Data API.
  quantity text not null check (quantity ~ '^\d{1,12}(\.\d{1,8})?$' and quantity::numeric > 0),
  price text check (price is null or price ~ '^\d{1,12}(\.\d{1,8})?$'),
  fees text not null default '0' check (fees ~ '^\d{1,12}(\.\d{1,8})?$'),
  source text not null check (char_length(btrim(source)) between 1 and 500),
  import_key uuid not null, payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check (kind in ('opening','void') or price is not null), check (archived_at is null),
  check ((kind='void' and void_entry_id is not null and price is null and fees::numeric=0) or (kind<>'void' and void_entry_id is null)),
  foreign key (account_id,user_id) references public.investment_accounts(id,user_id),
  unique (id,user_id), unique (user_id,import_key), unique (account_id,sequence),
  unique (account_id,void_entry_id), foreign key (void_entry_id,user_id) references public.investment_ledger(id,user_id)
);
create table public.investment_strategy_versions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  strategy_key text not null check (strategy_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$'), version integer not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body_markdown text not null check (char_length(btrim(body_markdown)) between 1 and 40000),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (id,user_id), unique (user_id,strategy_key,version)
);
-- Validate the JSON envelope at the database boundary too, not only in the web form.
create function public.valid_investment_research_json(p_kind text,p_as_of date,p_sources jsonb,p_provenance jsonb,p_metrics jsonb) returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; key text; raw text; start_date date; end_date date;
begin
  if p_sources is null or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources) not between 1 and 30 then return false; end if;
  for item in select value from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>2000 or (item #>> '{}') !~ '^https?://[^[:space:]]+$' then return false; end if;
  end loop;
  if p_provenance is null or jsonb_typeof(p_provenance)<>'object' or (p_provenance - array['producer','dataset_snapshot','code_version','period_start','period_end','benchmark','costs','limitations','artifact_url'])<>'{}'::jsonb then return false; end if;
  foreach key in array array['producer','limitations'] loop
    if jsonb_typeof(p_provenance->key) is distinct from 'string' or char_length(btrim(p_provenance->>key)) not between 1 and (case when key='producer' then 200 else 4000 end) then return false; end if;
  end loop;
  for key,item in select * from jsonb_each(p_provenance) loop
    if jsonb_typeof(item)<>'string' then return false; end if;
    raw := item #>> '{}';
    if key in ('code_version','benchmark') and char_length(raw)>200 then return false; end if;
    if key='dataset_snapshot' and char_length(raw)>1000 then return false; end if;
    if key in ('costs','artifact_url') and char_length(raw)>2000 then return false; end if;
    if key='artifact_url' and raw !~ '^https?://[^[:space:]]+$' then return false; end if;
    if key in ('period_start','period_end') and (raw !~ '^\d{4}-\d{2}-\d{2}$' or to_char(raw::date,'YYYY-MM-DD')<>raw) then return false; end if;
  end loop;
  if p_kind='research' then return p_metrics is null; end if;
  if p_kind<>'backtest' or p_metrics is null or jsonb_typeof(p_metrics)<>'object' or (p_metrics - array['total_return_pct','max_drawdown_pct'])<>'{}'::jsonb then return false; end if;
  foreach key in array array['dataset_snapshot','code_version','period_start','period_end','benchmark','costs','artifact_url'] loop
    if jsonb_typeof(p_provenance->key) is distinct from 'string' or char_length(btrim(p_provenance->>key))=0 then return false; end if;
  end loop;
  if jsonb_typeof(p_metrics->'total_return_pct') is distinct from 'string' or (p_metrics->>'total_return_pct') !~ '^-?\d{1,6}(\.\d{1,4})?$' then return false; end if;
  if jsonb_typeof(p_metrics->'max_drawdown_pct') is distinct from 'string' or (p_metrics->>'max_drawdown_pct') !~ '^\d{1,3}(\.\d{1,4})?$' then return false; end if;
  if (p_metrics->>'total_return_pct')::numeric < -100 or (p_metrics->>'max_drawdown_pct')::numeric > 100 then return false; end if;
  start_date := (p_provenance->>'period_start')::date; end_date := (p_provenance->>'period_end')::date;
  return start_date<=end_date and end_date<=p_as_of;
exception when others then return false;
end;
$$;
revoke all on function public.valid_investment_research_json(text,date,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.valid_investment_research_json(text,date,jsonb,jsonb,jsonb) to authenticated;
create table public.investment_research_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  import_key text not null check (char_length(btrim(import_key)) between 1 and 160),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  kind text not null check (kind in ('research','backtest')),
  body_markdown text not null check (char_length(btrim(body_markdown)) between 1 and 60000),
  as_of date not null, source_urls jsonb not null check (jsonb_typeof(source_urls) = 'array' and jsonb_array_length(source_urls) between 1 and 30),
  strategy_version_id uuid, provenance jsonb not null check (jsonb_typeof(provenance) = 'object'), metrics jsonb,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check ((kind = 'research' and metrics is null) or (kind = 'backtest' and metrics is not null and jsonb_typeof(metrics) = 'object' and provenance ?& array['dataset_snapshot','code_version','period_start','period_end','benchmark','costs','artifact_url'])),
  check (public.valid_investment_research_json(kind,as_of,source_urls,provenance,metrics)),
  foreign key (strategy_version_id,user_id) references public.investment_strategy_versions(id,user_id), unique (user_id,import_key)
);
create index investment_ledger_owner_account_date on public.investment_ledger(user_id,account_id,occurred_on,sequence);
create index investment_strategy_owner_recent on public.investment_strategy_versions(user_id,created_at desc);
create index investment_research_owner_recent on public.investment_research_runs(user_id,created_at desc);
create index investment_ledger_void_owner on public.investment_ledger(void_entry_id,user_id) where void_entry_id is not null;
create index investment_research_strategy_owner on public.investment_research_runs(strategy_version_id,user_id) where strategy_version_id is not null;

alter table public.investment_accounts enable row level security;
alter table public.investment_ledger enable row level security;
alter table public.investment_strategy_versions enable row level security;
alter table public.investment_research_runs enable row level security;
revoke all on public.investment_accounts, public.investment_ledger, public.investment_strategy_versions, public.investment_research_runs from anon, authenticated;
grant select,insert on public.investment_accounts, public.investment_ledger, public.investment_strategy_versions, public.investment_research_runs to authenticated;
grant update (revision,updated_at) on public.investment_accounts to authenticated;
create policy investment_accounts_select on public.investment_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy investment_accounts_insert on public.investment_accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy investment_accounts_revision on public.investment_accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy investment_ledger_select on public.investment_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy investment_ledger_insert on public.investment_ledger for insert to authenticated with check ((select auth.uid()) = user_id);
create policy investment_strategy_select on public.investment_strategy_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy investment_strategy_insert on public.investment_strategy_versions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy investment_research_select on public.investment_research_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy investment_research_insert on public.investment_research_runs for insert to authenticated with check ((select auth.uid()) = user_id);

-- Even direct inserts must lock the account and maintain a valid, chronological long-only ledger.
create function public.validate_investment_entry() returns trigger language plpgsql security invoker set search_path = '' as $$
declare account_revision integer; running_quantity numeric; target public.investment_ledger;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'not authorized' using errcode='42501'; end if;
  select revision into account_revision from public.investment_accounts where id=new.account_id and user_id=auth.uid() and archived_at is null for update;
  if not found then raise exception 'account unavailable' using errcode='23514'; end if;
  if new.occurred_on > (now() at time zone 'UTC')::date then raise exception 'future entry' using errcode='23514'; end if;
  new.sequence := account_revision + 1;
  if new.kind='void' then
    select * into target from public.investment_ledger where id=new.void_entry_id and account_id=new.account_id and user_id=auth.uid();
    if not found or target.kind='void' or target.symbol<>new.symbol or target.quantity<>new.quantity or target.occurred_on<>new.occurred_on or exists(select 1 from public.investment_ledger where void_entry_id=target.id) then raise exception 'invalid correction' using errcode='23514'; end if;
  end if;
  if new.kind='opening' and exists(select 1 from public.investment_ledger e where e.account_id=new.account_id and e.symbol=new.symbol and e.kind<>'void' and not exists(select 1 from public.investment_ledger v where v.void_entry_id=e.id)) then raise exception 'opening must be first' using errcode='23514'; end if;
  if new.kind<>'void' and exists(select 1 from public.investment_ledger e where e.account_id=new.account_id and e.symbol=new.symbol and e.kind='opening' and e.occurred_on>new.occurred_on and not exists(select 1 from public.investment_ledger v where v.void_entry_id=e.id)) then raise exception 'entry before opening' using errcode='23514'; end if;
  select min(qty) into running_quantity from (
    select sum(case when kind='sell' then -quantity::numeric else quantity::numeric end) over (order by occurred_on,sequence) qty from (
      select e.kind,e.quantity,e.occurred_on,e.sequence from public.investment_ledger e where e.account_id=new.account_id and e.symbol=new.symbol and e.kind<>'void' and (new.void_entry_id is null or e.id<>new.void_entry_id) and not exists(select 1 from public.investment_ledger v where v.void_entry_id=e.id)
      union all select new.kind,new.quantity,new.occurred_on,new.sequence where new.kind<>'void'
    ) events
  ) running;
  if running_quantity < 0 then raise exception 'oversell' using errcode='23514'; end if;
  update public.investment_accounts set revision=new.sequence,updated_at=now() where id=new.account_id and user_id=auth.uid();
  return new;
end;
$$;
create trigger investment_ledger_validate before insert on public.investment_ledger for each row execute function public.validate_investment_entry();

-- All insert paths, including authenticated direct inserts, get the same atomic audit.
create function public.audit_investment_insert() returns trigger language plpgsql security invoker set search_path = '' as $$
declare row_data jsonb; action_name text; details jsonb;
begin
  row_data := to_jsonb(new);
  if auth.uid() is null or (row_data->>'user_id')::uuid<>auth.uid() then raise exception 'not authorized' using errcode='42501'; end if;
  action_name := case tg_table_name when 'investment_accounts' then 'investment_account_create' when 'investment_ledger' then 'investment_entry_append' when 'investment_strategy_versions' then 'investment_strategy_version_append' else 'investment_research_import' end;
  details := case tg_table_name when 'investment_accounts' then jsonb_build_object('mode',row_data->>'mode','currency',row_data->>'currency') when 'investment_ledger' then jsonb_build_object('account_id',row_data->>'account_id','kind',row_data->>'kind','void_entry_id',row_data->>'void_entry_id') when 'investment_strategy_versions' then jsonb_build_object('strategy_key',row_data->>'strategy_key','version',row_data->'version') else jsonb_build_object('kind',row_data->>'kind') end;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data) values(auth.uid(),action_name,tg_table_name,(row_data->>'id')::uuid,'user',details);
  return new;
end;
$$;
revoke all on function public.audit_investment_insert() from public,anon,authenticated;
create trigger investment_accounts_audit after insert on public.investment_accounts for each row execute function public.audit_investment_insert();
create trigger investment_ledger_audit after insert on public.investment_ledger for each row execute function public.audit_investment_insert();
create trigger investment_strategy_audit after insert on public.investment_strategy_versions for each row execute function public.audit_investment_insert();
create trigger investment_research_audit after insert on public.investment_research_runs for each row execute function public.audit_investment_insert();

create function public.append_investment_entry(p_account_id uuid,p_expected_revision integer,p_entry jsonb,p_payload_hash text) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_revision integer; prior public.investment_ledger; inserted_id uuid;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select revision into current_revision from public.investment_accounts where id=p_account_id and user_id=auth.uid() and archived_at is null for update;
  if not found then raise exception 'account unavailable' using errcode='42501'; end if;
  select * into prior from public.investment_ledger where user_id=auth.uid() and import_key=(p_entry->>'import_key')::uuid;
  if found then
    if prior.payload_hash<>p_payload_hash or prior.account_id<>p_account_id
      or jsonb_build_object('kind',prior.kind,'void_entry_id',prior.void_entry_id,'symbol',prior.symbol,'occurred_on',prior.occurred_on,'quantity',prior.quantity,'price',prior.price,'fees',prior.fees,'source',prior.source)
      <> jsonb_build_object('kind',p_entry->>'kind','void_entry_id',(p_entry->>'void_entry_id')::uuid,'symbol',p_entry->>'symbol','occurred_on',(p_entry->>'occurred_on')::date,'quantity',p_entry->>'quantity','price',p_entry->>'price','fees',p_entry->>'fees','source',p_entry->>'source') then raise exception 'import conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.id,'duplicate',true);
  end if;
  if current_revision<>p_expected_revision then raise exception 'revision changed' using errcode='40001'; end if;
  insert into public.investment_ledger(user_id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,payload_hash)
  values(auth.uid(),p_account_id,current_revision+1,p_entry->>'kind',(p_entry->>'void_entry_id')::uuid,p_entry->>'symbol',(p_entry->>'occurred_on')::date,p_entry->>'quantity',p_entry->>'price',p_entry->>'fees',p_entry->>'source',(p_entry->>'import_key')::uuid,p_payload_hash) returning id into inserted_id;
  return jsonb_build_object('id',inserted_id,'duplicate',false);
end;
$$;
create function public.append_investment_strategy(p_strategy jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare next_version integer; inserted_id uuid;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':investment-strategy:' || (p_strategy->>'strategy_key'),0));
  select coalesce(max(version),0)+1 into next_version from public.investment_strategy_versions where user_id=auth.uid() and strategy_key=p_strategy->>'strategy_key';
  insert into public.investment_strategy_versions(user_id,strategy_key,version,title,body_markdown) values(auth.uid(),p_strategy->>'strategy_key',next_version,p_strategy->>'title',p_strategy->>'body_markdown') returning id into inserted_id;
  return jsonb_build_object('id',inserted_id,'version',next_version);
end;
$$;
create function public.append_investment_research(p_run jsonb,p_payload_hash text) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare prior public.investment_research_runs; inserted_id uuid;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':investment-research:' || (p_run->>'import_key'),0));
  select * into prior from public.investment_research_runs where user_id=auth.uid() and import_key=p_run->>'import_key';
  if found then
    if prior.payload_hash<>p_payload_hash
      or jsonb_build_object('title',prior.title,'kind',prior.kind,'body_markdown',prior.body_markdown,'as_of',prior.as_of,'source_urls',prior.source_urls,'strategy_version_id',prior.strategy_version_id,'provenance',prior.provenance,'metrics',prior.metrics)
      <> jsonb_build_object('title',p_run->>'title','kind',p_run->>'kind','body_markdown',p_run->>'body_markdown','as_of',(p_run->>'as_of')::date,'source_urls',p_run->'source_urls','strategy_version_id',(p_run->>'strategy_version_id')::uuid,'provenance',p_run->'provenance','metrics',nullif(p_run->'metrics','null'::jsonb)) then raise exception 'import conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.id,'duplicate',true);
  end if;
  insert into public.investment_research_runs(user_id,import_key,payload_hash,title,kind,body_markdown,as_of,source_urls,strategy_version_id,provenance,metrics)
  values(auth.uid(),p_run->>'import_key',p_payload_hash,p_run->>'title',p_run->>'kind',p_run->>'body_markdown',(p_run->>'as_of')::date,p_run->'source_urls',(p_run->>'strategy_version_id')::uuid,p_run->'provenance',nullif(p_run->'metrics','null'::jsonb)) returning id into inserted_id;
  return jsonb_build_object('id',inserted_id,'duplicate',false);
end;
$$;
revoke all on function public.validate_investment_entry(),public.append_investment_entry(uuid,integer,jsonb,text),public.append_investment_strategy(jsonb),public.append_investment_research(jsonb,text) from public,anon;
grant execute on function public.append_investment_entry(uuid,integer,jsonb,text),public.append_investment_strategy(jsonb),public.append_investment_research(jsonb,text) to authenticated;
commit;
