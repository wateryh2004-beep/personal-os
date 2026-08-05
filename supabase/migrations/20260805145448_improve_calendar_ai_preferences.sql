alter table public.ai_provider_settings
  drop constraint ai_provider_settings_model_check,
  add constraint ai_provider_settings_model_check check (model in ('deepseek-v4-flash', 'deepseek-v4-pro')),
  add column default_event_duration_minutes integer not null default 30
    check (default_event_duration_minutes in (15, 30, 45, 60, 90, 120));
