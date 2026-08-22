-- AI governance is deliberately separate from provider credentials. These
-- records contain consent, limits, and compact audit metadata only.
alter table public.notes
  add column if not exists ai_visibility text not null default 'normal'
    check (ai_visibility in ('normal','sensitive','never'));
alter table public.documents
  add column if not exists ai_visibility text not null default 'normal'
    check (ai_visibility in ('normal','sensitive','never'));

create table public.ai_governance_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  semantic_retrieval_opt_in boolean not null default false,
  long_term_memory_opt_in boolean not null default false,
  max_context_chars_per_request integer not null default 12000 check (max_context_chars_per_request between 1000 and 64000),
  max_output_tokens_per_request integer not null default 1200 check (max_output_tokens_per_request between 128 and 8000),
  daily_call_limit integer not null default 40 check (daily_call_limit between 1 and 10000),
  monthly_call_limit integer not null default 600 check (monthly_call_limit between 1 and 100000),
  daily_cost_limit_usd numeric(10,4) not null default 2 check (daily_cost_limit_usd >= 0 and daily_cost_limit_usd <= 1000),
  monthly_cost_limit_usd numeric(10,4) not null default 20 check (monthly_cost_limit_usd >= 0 and monthly_cost_limit_usd <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_request_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  surface text not null check (char_length(surface) between 1 and 80),
  purpose text not null check (char_length(purpose) between 1 and 120),
  model text,
  status text not null check (status in ('allowed','completed','failed','blocked_budget','blocked_privacy','cancelled')),
  retrieval_mode text not null check (retrieval_mode in ('none','local','targeted','expanded')),
  source_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(source_summary) = 'object'),
  retrieval_reason text not null default '' check (char_length(retrieval_reason) <= 500),
  context_chars integer not null default 0 check (context_chars >= 0),
  output_token_limit integer not null default 0 check (output_token_limit >= 0),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(10,6) not null default 0 check (estimated_cost_usd >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  feedback text check (feedback is null or feedback in ('up','down')),
  feedback_reason text check (feedback_reason is null or char_length(feedback_reason) <= 500),
  source_correction text check (source_correction is null or char_length(source_correction) <= 500),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz
);

create index ai_request_audits_user_created_idx
  on public.ai_request_audits (user_id, created_at desc)
  where archived_at is null;
create index ai_request_audits_user_status_created_idx
  on public.ai_request_audits (user_id, status, created_at desc)
  where archived_at is null;
create index notes_ai_visibility_idx
  on public.notes (user_id, ai_visibility, updated_at desc)
  where archived_at is null;
create index documents_ai_visibility_idx
  on public.documents (user_id, ai_visibility, updated_at desc)
  where archived_at is null;

create trigger ai_governance_settings_updated_at
  before update on public.ai_governance_settings
  for each row execute procedure public.set_updated_at();

alter table public.ai_governance_settings enable row level security;
alter table public.ai_request_audits enable row level security;

create policy "ai_governance_settings_select_own"
  on public.ai_governance_settings for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "ai_governance_settings_insert_own"
  on public.ai_governance_settings for insert to authenticated
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "ai_governance_settings_update_own"
  on public.ai_governance_settings for update to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "ai_request_audits_select_own"
  on public.ai_request_audits for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));

revoke all on public.ai_governance_settings, public.ai_request_audits from anon;
revoke insert, update, delete on public.ai_request_audits from authenticated;
grant select, insert, update on public.ai_governance_settings to authenticated;
grant select on public.ai_request_audits to authenticated;

comment on table public.ai_request_audits is
  'Per-request AI audit metadata only: no prompt body, model output, provider payload, API key, or reasoning chain.';
