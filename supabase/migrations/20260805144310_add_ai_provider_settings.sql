create table public.ai_provider_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'deepseek' check (provider = 'deepseek'),
  api_key_ciphertext text not null check (char_length(api_key_ciphertext) > 40),
  model text not null default 'deepseek-v4-flash' check (model = 'deepseek-v4-flash'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger ai_provider_settings_updated_at before update on public.ai_provider_settings
  for each row execute procedure public.set_updated_at();

alter table public.ai_provider_settings enable row level security;

create policy "ai_provider_settings_select_own" on public.ai_provider_settings for select using ((select auth.uid()) = user_id);
create policy "ai_provider_settings_insert_own" on public.ai_provider_settings for insert with check ((select auth.uid()) = user_id);
create policy "ai_provider_settings_update_own" on public.ai_provider_settings for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_provider_settings_delete_own" on public.ai_provider_settings for delete using ((select auth.uid()) = user_id);

comment on column public.ai_provider_settings.api_key_ciphertext is
  'AES-256-GCM ciphertext only. The DeepSeek key is never returned to the browser after submission.';
