-- Technical singleton, not business data: no answer, email, password or token.
create table public.question_recovery_attempts (
  singleton boolean primary key default true check (singleton),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 6)
);
alter table public.question_recovery_attempts enable row level security;
alter table public.question_recovery_attempts force row level security;
revoke all on public.question_recovery_attempts from public, anon, authenticated, service_role;
grant select, insert, update on public.question_recovery_attempts to service_role;

-- INVOKER: only the server's service_role can call or access this counter.
-- UPSERT locks the single row, so separate app instances share one atomic limit.
create function public.consume_question_recovery_attempt()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_time_at timestamptz := clock_timestamp();
  current_attempts integer;
begin
  insert into public.question_recovery_attempts as counter
    (singleton, window_started_at, attempts)
  values (true, current_time_at, 1)
  on conflict (singleton) do update set
    window_started_at = case
      when counter.window_started_at <= current_time_at - interval '15 minutes'
      then current_time_at else counter.window_started_at end,
    attempts = case
      when counter.window_started_at <= current_time_at - interval '15 minutes'
      then 1 else least(counter.attempts + 1, 6) end
  returning attempts into current_attempts;
  return current_attempts <= 5;
end;
$$;
revoke all on function public.consume_question_recovery_attempt() from public, anon, authenticated;
grant execute on function public.consume_question_recovery_attempt() to service_role;
