alter table public.feeds
  add column if not exists verification_status text not null default 'verified'
    check (verification_status in ('pending', 'verified', 'rejected')),
  add column if not exists personal_priority text not null default 'normal'
    check (personal_priority in ('core', 'important', 'normal', 'explore')),
  add column if not exists source_quality text not null default 'standard'
    check (source_quality in ('primary', 'high', 'standard', 'opinion')),
  add column if not exists reason_for_subscription text,
  add column if not exists verified_at timestamptz;

update public.feeds
set personal_priority = case
  when priority >= 80 then 'core'
  when priority >= 60 then 'important'
  when priority >= 40 then 'normal'
  else 'explore'
end,
verification_status = 'verified',
verified_at = coalesce(verified_at, created_at)
where verification_status = 'verified';

create index if not exists feeds_owner_briefing_eligibility_idx
  on public.feeds (user_id, verification_status, status, priority desc)
  where archived_at is null;

create table if not exists public.briefing_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phrase text not null check (char_length(trim(phrase)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, phrase)
);
alter table public.briefing_exclusions enable row level security;
create policy "briefing_exclusions_own" on public.briefing_exclusions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger briefing_exclusions_updated_at before update on public.briefing_exclusions for each row execute procedure public.set_updated_at();
