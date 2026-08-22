alter table public.ai_governance_settings
  add column if not exists estimated_input_cost_per_million_usd numeric(10,4) not null default 0.50 check (estimated_input_cost_per_million_usd >= 0 and estimated_input_cost_per_million_usd <= 1000),
  add column if not exists estimated_output_cost_per_million_usd numeric(10,4) not null default 2.00 check (estimated_output_cost_per_million_usd >= 0 and estimated_output_cost_per_million_usd <= 1000);

comment on column public.ai_governance_settings.estimated_input_cost_per_million_usd is
  'Owner-configured planning estimate, not a provider invoice or credential.';
