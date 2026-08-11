alter table public.briefings
  drop constraint if exists briefings_ranking_method_check,
  add constraint briefings_ranking_method_check
    check (ranking_method in ('deterministic', 'hybrid', 'ai_hybrid', 'deterministic_fallback')),
  add column if not exists ai_model text,
  add column if not exists prompt_version text,
  add column if not exists ai_call_count integer not null default 0 check (ai_call_count >= 0),
  add column if not exists input_tokens integer not null default 0 check (input_tokens >= 0),
  add column if not exists output_tokens integer not null default 0 check (output_tokens >= 0),
  add column if not exists ai_usage_reported boolean not null default false;

create table public.briefing_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  max_ai_candidates integer not null default 24 check (max_ai_candidates between 1 and 48),
  max_selected_items integer not null default 8 check (max_selected_items between 1 and 12),
  daily_input_token_budget integer not null default 20000 check (daily_input_token_budget between 1000 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.briefing_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  content_hash text not null,
  preference_version integer not null default 1,
  prompt_version text not null,
  model text not null,
  personal_relevance numeric not null check (personal_relevance between 0 and 100),
  information_value numeric not null check (information_value between 0 and 100),
  novelty numeric not null check (novelty between 0 and 100),
  timeliness numeric not null check (timeliness between 0 and 100),
  confidence numeric not null check (confidence between 0 and 1),
  reason text not null check (char_length(reason) <= 600),
  matched_topics text[] not null default '{}',
  input_tokens integer,
  output_tokens integer,
  usage_reported boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, feed_item_id, content_hash, preference_version, prompt_version, model)
);

create index briefings_owner_ai_usage_idx on public.briefings(user_id, briefing_date desc)
  where ai_call_count > 0;
create index briefing_ai_evaluations_lookup_idx on public.briefing_ai_evaluations
  (user_id, feed_item_id, created_at desc);

alter table public.briefing_settings enable row level security;
alter table public.briefing_ai_evaluations enable row level security;
create policy "briefing_settings_own" on public.briefing_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "briefing_ai_evaluations_own" on public.briefing_ai_evaluations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger briefing_settings_updated_at before update on public.briefing_settings
  for each row execute procedure public.set_updated_at();
