-- Personal OS Agent Layer V1.
-- The model may read data and freeze proposals. Only authenticated,
-- owner-scoped deterministic code may approve and execute those proposals.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('global', 'calendar', 'tasks', 'inbox', 'career', 'notes')),
  status text not null default 'pending' check (status in ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  user_request text not null default '' check (char_length(user_request) <= 10000),
  model text,
  current_path text check (current_path is null or char_length(current_path) <= 1000),
  current_entity_type text check (current_entity_type is null or char_length(current_entity_type) <= 100),
  current_entity_id uuid,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 200),
  role text not null check (role in ('user', 'assistant')),
  content_json jsonb not null default '{}'::jsonb check (jsonb_typeof(content_json) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.agent_runs(id, user_id) on delete cascade,
  unique (run_id, external_id)
);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  step_type text not null check (step_type in ('context', 'reasoning_summary', 'tool', 'proposal', 'result', 'error')),
  tool_name text check (tool_name is null or char_length(tool_name) <= 120),
  title text not null check (char_length(title) between 1 and 240),
  summary text not null default '' check (char_length(summary) <= 2000),
  input_json jsonb not null default '{}'::jsonb check (jsonb_typeof(input_json) = 'object'),
  output_json jsonb not null default '{}'::jsonb check (jsonb_typeof(output_json) = 'object'),
  status text not null default 'succeeded' check (status in ('running', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.agent_runs(id, user_id) on delete cascade
);

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('calendar', 'tasks', 'notes', 'career', 'memory', 'projects')),
  action_type text not null check (char_length(action_type) between 1 and 120),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executing', 'succeeded', 'failed', 'conflict')),
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  preview_json jsonb not null default '{}'::jsonb check (jsonb_typeof(preview_json) = 'object'),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  result_json jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.agent_runs(id, user_id) on delete cascade
);

create index agent_runs_user_updated_idx on public.agent_runs (user_id, updated_at desc);
create index agent_runs_user_status_idx on public.agent_runs (user_id, status, updated_at desc);
create index agent_messages_run_created_idx on public.agent_messages (run_id, created_at);
create index agent_steps_run_index_idx on public.agent_steps (run_id, step_index);
create index agent_actions_run_status_idx on public.agent_actions (run_id, status, created_at);
create index agent_actions_user_status_idx on public.agent_actions (user_id, status, created_at desc);

create trigger agent_runs_updated_at before update on public.agent_runs
for each row execute procedure public.set_updated_at();
create trigger agent_actions_updated_at before update on public.agent_actions
for each row execute procedure public.set_updated_at();

alter table public.agent_runs enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_actions enable row level security;

create policy "agent_runs_select_own" on public.agent_runs for select to authenticated
using ((select auth.uid()) = user_id);
create policy "agent_runs_insert_own" on public.agent_runs for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "agent_runs_update_own" on public.agent_runs for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "agent_messages_select_own" on public.agent_messages for select to authenticated
using ((select auth.uid()) = user_id);
create policy "agent_messages_insert_own" on public.agent_messages for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "agent_steps_select_own" on public.agent_steps for select to authenticated
using ((select auth.uid()) = user_id);
create policy "agent_steps_insert_own" on public.agent_steps for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "agent_actions_select_own" on public.agent_actions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "agent_actions_insert_own" on public.agent_actions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "agent_actions_update_own" on public.agent_actions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.agent_runs, public.agent_messages, public.agent_steps, public.agent_actions from anon;
revoke all on public.agent_runs, public.agent_messages, public.agent_steps, public.agent_actions from authenticated;
grant select, insert, update on public.agent_runs to authenticated;
grant select, insert on public.agent_messages, public.agent_steps to authenticated;
grant select, insert, update on public.agent_actions to authenticated;

-- Agent-approved Memory replacements use a dedicated atomic function. It
-- preserves the old row, rejects stale proposals, and records the new row as
-- originating from an assistant proposal instead of a manual edit.
create or replace function public.supersede_personal_memory_from_agent(
  p_memory_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_content text,
  p_ai_visibility text,
  p_valid_until timestamptz default null,
  p_review_at timestamptz default null
) returns public.personal_memories
language plpgsql security invoker set search_path = public as $$
declare
  old_row public.personal_memories;
  result public.personal_memories;
begin
  select * into old_row
  from public.personal_memories
  where id = p_memory_id
    and user_id = (select auth.uid())
    and status = 'active'
    and archived_at is null
  for update;

  if old_row.id is null or old_row.updated_at <> p_expected_updated_at then
    raise exception 'memory changed';
  end if;
  if old_row.memory_type = 'working'
    and p_valid_until is null
    and p_review_at is null then
    raise exception 'working memory needs validity';
  end if;

  update public.personal_memories
  set status = 'superseded'
  where id = old_row.id;

  insert into public.personal_memories (
    user_id,
    memory_type,
    memory_key,
    title,
    content,
    ai_visibility,
    valid_until,
    review_at,
    supersedes_memory_id,
    created_via
  ) values (
    (select auth.uid()),
    old_row.memory_type,
    old_row.memory_key,
    trim(p_title),
    trim(p_content),
    p_ai_visibility,
    p_valid_until,
    p_review_at,
    old_row.id,
    'assistant_proposal'
  ) returning * into result;

  return result;
end;
$$;

revoke all on function public.supersede_personal_memory_from_agent(
  uuid,
  timestamptz,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public;
grant execute on function public.supersede_personal_memory_from_agent(
  uuid,
  timestamptz,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to authenticated;
