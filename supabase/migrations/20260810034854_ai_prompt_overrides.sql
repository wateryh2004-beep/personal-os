-- User-owned overrides for versioned AI prompt registries. Defaults remain in code.
create table public.ai_prompt_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (char_length(prompt_key) between 1 and 120),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_key)
);

create index ai_prompt_overrides_user_idx
  on public.ai_prompt_overrides (user_id, prompt_key);

create trigger ai_prompt_overrides_updated_at
  before update on public.ai_prompt_overrides
  for each row execute procedure public.set_updated_at();

alter table public.ai_prompt_overrides enable row level security;

create policy "ai_prompt_overrides_select_own"
  on public.ai_prompt_overrides for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ai_prompt_overrides_insert_own"
  on public.ai_prompt_overrides for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "ai_prompt_overrides_update_own"
  on public.ai_prompt_overrides for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "ai_prompt_overrides_delete_own"
  on public.ai_prompt_overrides for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_prompt_overrides from anon;
grant select, insert, update, delete on table public.ai_prompt_overrides to authenticated;

comment on table public.ai_prompt_overrides is
  'Owner-scoped prompt overrides. Default prompt text remains versioned in application code.';
