create table public.feeds (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, feed_url text not null, site_url text, description text,
  feed_type text not null default 'unknown' check(feed_type in ('rss','atom','unknown')),
  status text not null default 'active' check(status in ('active','paused','error','archived')),
  priority integer not null default 50 check(priority between 0 and 100), category text,
  etag text, last_modified text, last_fetched_at timestamptz, last_successful_fetch_at timestamptz,
  last_http_status integer, consecutive_error_count integer not null default 0, last_error_code text, last_error_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create unique index feeds_active_url_idx on public.feeds(user_id,feed_url) where archived_at is null;

create table public.feed_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  feed_id uuid not null references public.feeds(id) on delete cascade, identity_key text not null, external_id text,
  url text, canonical_url text, title text not null check(char_length(title)<=1000), normalized_title text not null,
  author text, published_at timestamptz, updated_at_source timestamptz, excerpt text check(char_length(excerpt)<=2000),
  content_text text check(char_length(content_text)<=20000), content_hash text, language text,
  fetched_at timestamptz not null default now(), first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,feed_id,identity_key)
);
create index feed_items_owner_recent_idx on public.feed_items(user_id,published_at desc nulls last,first_seen_at desc) where archived_at is null;
create index feed_items_canonical_url_idx on public.feed_items(user_id,canonical_url) where archived_at is null and canonical_url is not null;

create table public.feed_item_clusters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null, representative_item_id uuid not null references public.feed_items(id), canonical_url text,
  normalized_title text not null, earliest_published_at timestamptz, latest_published_at timestamptz,
  source_count integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(user_id,fingerprint)
);
create table public.feed_item_cluster_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  cluster_id uuid not null references public.feed_item_clusters(id) on delete cascade,
  feed_item_id uuid not null references public.feed_items(id) on delete cascade unique,
  match_method text not null check(match_method in ('canonical_url','content_hash','normalized_title','near_title','manual')),
  similarity numeric, created_at timestamptz not null default now(), primary key(cluster_id,feed_item_id)
);
create table public.briefing_interests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, keywords text[] not null default '{}', excluded_keywords text[] not null default '{}',
  weight integer not null default 50 check(weight between 0 and 100), status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.briefings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null, timezone text not null, status text not null default 'generating' check(status in ('generating','completed','failed')),
  ranking_method text not null check(ranking_method in ('deterministic','hybrid')), source_window_start timestamptz not null, source_window_end timestamptz not null,
  candidate_count integer not null default 0, cluster_count integer not null default 0, selected_count integer not null default 0, filtered_count integer not null default 0,
  generated_at timestamptz, generation_version integer not null default 1, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,briefing_date)
);
create table public.briefing_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  cluster_id uuid not null references public.feed_item_clusters(id), representative_item_id uuid not null references public.feed_items(id),
  section text not null check(section in ('must_know','worth_reading','optional')), position integer not null,
  relevance_reason text, summary text, ranking_metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(briefing_id,cluster_id), unique(briefing_id,section,position)
);

alter table public.feeds enable row level security; alter table public.feed_items enable row level security;
alter table public.feed_item_clusters enable row level security; alter table public.feed_item_cluster_members enable row level security;
alter table public.briefing_interests enable row level security; alter table public.briefings enable row level security; alter table public.briefing_entries enable row level security;
create policy "feeds_own" on public.feeds for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "feed_items_own" on public.feed_items for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "feed_clusters_own" on public.feed_item_clusters for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "feed_cluster_members_own" on public.feed_item_cluster_members for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "briefing_interests_own" on public.briefing_interests for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "briefings_own" on public.briefings for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "briefing_entries_own" on public.briefing_entries for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create trigger feeds_updated_at before update on public.feeds for each row execute procedure public.set_updated_at();
create trigger feed_items_updated_at before update on public.feed_items for each row execute procedure public.set_updated_at();
create trigger feed_item_clusters_updated_at before update on public.feed_item_clusters for each row execute procedure public.set_updated_at();
create trigger briefing_interests_updated_at before update on public.briefing_interests for each row execute procedure public.set_updated_at();
create trigger briefings_updated_at before update on public.briefings for each row execute procedure public.set_updated_at();
