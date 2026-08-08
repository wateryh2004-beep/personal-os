create table public.personal_memories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null check (memory_type in ('profile','working')), memory_key text not null,
  title text not null check (char_length(title) between 1 and 160), content text not null check (char_length(content) between 1 and 10000), structured_data jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','superseded','archived')), created_via text not null default 'manual' check (created_via in ('manual','assistant_proposal')),
  ai_visibility text not null default 'normal' check (ai_visibility in ('normal','sensitive','never')), valid_from timestamptz not null default now(), valid_until timestamptz, review_at timestamptz,
  supersedes_memory_id uuid, confirmed_at timestamptz not null default now(), archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id,id), foreign key (user_id,supersedes_memory_id) references public.personal_memories(user_id,id),
  check (memory_type <> 'working' or valid_until is not null or review_at is not null), check (valid_until is null or valid_until > valid_from)
);
create unique index personal_memories_active_key_idx on public.personal_memories(user_id,memory_type,memory_key) where status = 'active' and archived_at is null;
create index personal_memories_context_idx on public.personal_memories(user_id,memory_type,ai_visibility) where status = 'active' and archived_at is null;
create trigger personal_memories_updated_at before update on public.personal_memories for each row execute procedure public.set_updated_at();

create table public.decisions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200), decision_text text not null check (char_length(decision_text) between 1 and 5000), rationale_markdown text not null default '', context_markdown text not null default '',
  status text not null default 'active' check (status in ('active','superseded','reversed','archived')), importance text not null default 'normal' check (importance in ('low','normal','high')), created_via text not null default 'manual' check (created_via in ('manual','assistant_proposal')),
  ai_visibility text not null default 'normal' check (ai_visibility in ('normal','sensitive','never')), decided_at timestamptz not null default now(), review_at timestamptz, supersedes_decision_id uuid,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id), foreign key(user_id,supersedes_decision_id) references public.decisions(user_id,id)
);
create index decisions_context_idx on public.decisions(user_id,status,importance,decided_at desc) where archived_at is null;
create trigger decisions_updated_at before update on public.decisions for each row execute procedure public.set_updated_at();

create table public.memory_sources (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, memory_id uuid not null references public.personal_memories(id) on delete cascade, source_type text not null, source_id uuid not null, source_role text not null default 'evidence' check (source_role in ('origin','evidence','context')), created_at timestamptz not null default now(), unique(memory_id,source_type,source_id,source_role));
create table public.decision_sources (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, decision_id uuid not null references public.decisions(id) on delete cascade, source_type text not null, source_id uuid not null, source_role text not null default 'context' check (source_role in ('origin','context','evidence_for','evidence_against')), created_at timestamptz not null default now(), unique(decision_id,source_type,source_id,source_role));

alter table public.personal_memories enable row level security; alter table public.decisions enable row level security; alter table public.memory_sources enable row level security; alter table public.decision_sources enable row level security;
create policy "personal_memories_own" on public.personal_memories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "decisions_own" on public.decisions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memory_sources_own" on public.memory_sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "decision_sources_own" on public.decision_sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
