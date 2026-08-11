alter table public.agent_runs
  add column if not exists context_mode text check (context_mode in ('none','local','targeted','cross_module','action')),
  add column if not exists request_complexity text check (request_complexity in ('simple','moderate','deep')),
  add column if not exists initial_modules text[] not null default '{}',
  add column if not exists active_skills text[] not null default '{}',
  add column if not exists initial_tool_names text[] not null default '{}',
  add column if not exists discovered_tool_names text[] not null default '{}',
  add column if not exists personal_data_accessed boolean not null default false,
  add column if not exists source_count integer not null default 0 check (source_count >= 0),
  add column if not exists tool_call_count integer not null default 0 check (tool_call_count >= 0),
  add column if not exists kernel_state jsonb not null default '{}'::jsonb check (jsonb_typeof(kernel_state) = 'object');

create index if not exists agent_runs_kernel_context_idx on public.agent_runs (user_id, context_mode, updated_at desc);
