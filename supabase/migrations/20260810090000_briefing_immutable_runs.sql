-- A briefing row now represents one immutable generation run rather than a daily slot.
alter table public.briefings
  drop constraint if exists briefings_user_id_briefing_date_key;

alter table public.briefings
  add column if not exists trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'scheduled', 'on_open'));

create index if not exists briefings_owner_status_generated_at_idx
  on public.briefings (user_id, status, generated_at desc);

create index if not exists briefings_owner_date_generated_at_idx
  on public.briefings (user_id, briefing_date desc, generated_at desc);
