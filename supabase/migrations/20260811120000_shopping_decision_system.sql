create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500), category text, source_url text, image_url text,
  price_cny numeric(12,2), necessity text not null default 'unknown' check (necessity in ('unknown','necessary','nonessential')),
  necessity_confirmed boolean not null default false,
  status text not null default 'inbox' check (status in ('inbox','cooling','ready','purchased','abandoned','archived')),
  cooldown_until timestamptz, reason_to_buy text, existing_alternative text, expected_usage text, notes_markdown text not null default '',
  created_via text not null default 'manual' check (created_via in ('manual','command_palette','assistant','import')),
  ai_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_metadata)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), decided_at timestamptz, purchased_at timestamptz, abandoned_at timestamptz, archived_at timestamptz,
  check (price_cny is null or price_cny >= 0)
);
create index purchase_items_user_status_idx on public.purchase_items(user_id,status);
create index purchase_items_user_cooldown_idx on public.purchase_items(user_id,cooldown_until);
create index purchase_items_user_created_idx on public.purchase_items(user_id,created_at desc);
create trigger purchase_items_updated_at before update on public.purchase_items for each row execute procedure public.set_updated_at();
alter table public.purchase_items enable row level security;
create policy "purchase_items_select_own" on public.purchase_items for select using ((select auth.uid())=user_id);
create policy "purchase_items_insert_own" on public.purchase_items for insert with check ((select auth.uid())=user_id);
create policy "purchase_items_update_own" on public.purchase_items for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.purchase_items from anon;
grant select,insert,update on public.purchase_items to authenticated;
