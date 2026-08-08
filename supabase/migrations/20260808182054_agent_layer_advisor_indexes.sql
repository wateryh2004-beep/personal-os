-- Cover Agent ownership foreign keys and owner-scoped history reads.
create index if not exists agent_messages_run_user_idx
  on public.agent_messages (run_id, user_id);
create index if not exists agent_messages_user_created_idx
  on public.agent_messages (user_id, created_at desc);
create index if not exists agent_steps_run_user_idx
  on public.agent_steps (run_id, user_id);
create index if not exists agent_steps_user_created_idx
  on public.agent_steps (user_id, created_at desc);
create index if not exists agent_actions_run_user_idx
  on public.agent_actions (run_id, user_id);
