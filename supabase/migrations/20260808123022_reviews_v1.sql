create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('daily', 'weekly', 'decision')),
  review_key text not null,
  title text not null check (char_length(title) between 1 and 240),
  period_start date not null,
  period_end date not null,
  decision_id uuid references public.decisions(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'completed', 'archived')),
  content_markdown text not null default '' check (char_length(content_markdown) <= 10000),
  structured_data jsonb not null default '{}'::jsonb,
  generated_with_ai boolean not null default false,
  source_snapshot_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_key),
  check (period_end >= period_start),
  check ((review_type = 'decision' and decision_id is not null) or (review_type <> 'decision' and decision_id is null))
);

create index reviews_context_idx on public.reviews(user_id, review_type, period_end desc)
  where status = 'completed' and archived_at is null;
create index reviews_decision_idx on public.reviews(user_id, decision_id, completed_at desc)
  where review_type = 'decision' and status = 'completed' and archived_at is null;

create table public.review_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_markdown text not null,
  structured_data jsonb not null default '{}'::jsonb,
  reason text not null check (reason in ('draft_saved', 'completed', 'amended')),
  created_at timestamptz not null default now(),
  unique (review_id, version_number)
);

create table public.review_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  source_role text not null default 'context' check (source_role in ('origin', 'context', 'cited')),
  created_at timestamptz not null default now(),
  unique (review_id, source_type, source_id, source_role)
);

create table public.review_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  proposal_type text not null check (proposal_type in ('profile_memory', 'working_memory', 'decision_keep', 'decision_supersede', 'decision_reverse')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  resulting_entity_type text,
  resulting_entity_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_proposals_pending_idx on public.review_proposals(user_id, review_id)
  where status = 'pending';
create trigger reviews_updated_at before update on public.reviews for each row execute procedure public.set_updated_at();
create trigger review_proposals_updated_at before update on public.review_proposals for each row execute procedure public.set_updated_at();
alter table public.decisions add column last_reviewed_at timestamptz;

alter table public.reviews enable row level security;
alter table public.review_versions enable row level security;
alter table public.review_sources enable row level security;
alter table public.review_proposals enable row level security;
create policy "reviews_own" on public.reviews for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "review_versions_own" on public.review_versions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "review_sources_own" on public.review_sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "review_proposals_own" on public.review_proposals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.sync_review_search_document() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_documents where entity_type = 'review' and entity_id = old.id;
    return old;
  end if;
  if new.status <> 'completed' or new.archived_at is not null then
    delete from public.search_documents where entity_type = 'review' and entity_id = new.id;
    return new;
  end if;
  insert into public.search_documents (user_id, domain, entity_type, entity_id, title, subtitle, content_text, metadata, source_updated_at)
  values (new.user_id, 'reviews', 'review', new.id, new.title, concat(new.period_start, ' — ', new.period_end), new.content_markdown, jsonb_build_object('review_type', new.review_type, 'period_start', new.period_start, 'period_end', new.period_end, 'completed_at', new.completed_at), new.updated_at)
  on conflict (user_id, entity_type, entity_id) do update set title = excluded.title, subtitle = excluded.subtitle, content_text = excluded.content_text, metadata = excluded.metadata, source_updated_at = excluded.source_updated_at, updated_at = now();
  return new;
end;
$$;
create trigger reviews_search_sync after insert or update or delete on public.reviews for each row execute procedure public.sync_review_search_document();
