-- Career Roadmap: tracks are planning lanes, not a replacement for Tasks or Calendar.
create table public.career_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  color text not null default 'blue' check (color in ('blue', 'slate', 'amber', 'violet', 'teal')),
  position numeric not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.career_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.career_tracks(id) on delete restrict,
  career_direction_id uuid references public.career_directions(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  description text,
  starts_on date,
  target_date date not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  importance text not null default 'normal' check (importance in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (starts_on is null or starts_on <= target_date)
);

create index career_tracks_user_position_idx on public.career_tracks (user_id, position) where archived_at is null;
create index career_milestones_user_target_idx on public.career_milestones (user_id, target_date) where archived_at is null;
create index career_milestones_track_target_idx on public.career_milestones (track_id, target_date) where archived_at is null;

create trigger career_tracks_updated_at before update on public.career_tracks for each row execute procedure public.set_updated_at();
create trigger career_milestones_updated_at before update on public.career_milestones for each row execute procedure public.set_updated_at();

alter table public.career_tracks enable row level security;
alter table public.career_milestones enable row level security;

create policy "career_tracks_select_own" on public.career_tracks for select to authenticated using ((select auth.uid()) = user_id);
create policy "career_tracks_insert_own" on public.career_tracks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "career_tracks_update_own" on public.career_tracks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "career_tracks_delete_own" on public.career_tracks for delete to authenticated using ((select auth.uid()) = user_id);
create policy "career_milestones_select_own" on public.career_milestones for select to authenticated using ((select auth.uid()) = user_id);
create policy "career_milestones_insert_own" on public.career_milestones for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "career_milestones_update_own" on public.career_milestones for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "career_milestones_delete_own" on public.career_milestones for delete to authenticated using ((select auth.uid()) = user_id);
