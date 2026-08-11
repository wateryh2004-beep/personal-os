alter table public.briefing_settings
  add column if not exists generation_mode text not null default 'scheduled'
    check (generation_mode in ('scheduled', 'on_open', 'manual')),
  add column if not exists budget_exhaustion_behavior text not null default 'fallback'
    check (budget_exhaustion_behavior in ('fallback', 'pause'));
