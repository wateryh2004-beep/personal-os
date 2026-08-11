alter table public.agent_actions drop constraint if exists agent_actions_domain_check;
alter table public.agent_actions add constraint agent_actions_domain_check check (domain in ('calendar', 'tasks', 'notes', 'career', 'memory', 'projects', 'shopping', 'travel'));
alter table public.agent_actions add column if not exists expires_at timestamptz;
create index if not exists agent_actions_proposal_expiry_idx on public.agent_actions(user_id, expires_at) where status = 'proposed';
