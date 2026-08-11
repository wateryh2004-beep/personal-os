alter table public.briefings
  add column if not exists ai_failure_code text
    check (ai_failure_code is null or ai_failure_code in (
      'ai_disabled',
      'ai_budget_exhausted',
      'briefing_settings_unavailable',
      'ai_server_configuration_missing',
      'deepseek_not_configured',
      'deepseek_credential_unreadable',
      'ai_provider_request_failed'
    ));
