-- Personal OS / Career / Interview Lab Schema V1.1
-- PRODUCTION CANDIDATE — validated in an isolated Supabase test project.
-- Validation date: 2026-09-29. Production has NOT been modified.
-- Formal GitHub migration for review; apply to production only after explicit approval.
--
-- Design principles:
-- 1) Question != Preparation != Attempt.
-- 2) Reuse existing Career evidence through public.entity_links; do not duplicate Career facts.
-- 3) RLS on every new public table.
-- 4) No authenticated hard-delete grants in V1.1; archive instead.
-- 5) Explicit Data API GRANTs are included so behavior does not depend on Supabase default privileges.
-- 6) AI-authored answers cannot become current until confirmed_at is set.
-- 7) Database enforces the invariant for status='ready', but the application owns normal workflow transitions.

-- ---------------------------------------------------------------------------
-- 1. Canonical interview questions
-- ---------------------------------------------------------------------------

create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  canonical_prompt text not null
    check (char_length(trim(canonical_prompt)) between 1 and 10000),
  short_title text
    check (short_title is null or char_length(trim(short_title)) between 1 and 240),

  category text not null
    check (category in (
      'resume',
      'motivation_fit',
      'behavioral',
      'situational',
      'business_commercial',
      'knowledge',
      'stress',
      'interviewer_question'
    )),
  subcategory text
    check (subcategory is null or char_length(trim(subcategory)) between 1 and 120),

  -- Values are selected from an application-level registry; the DB only limits size.
  competency_tags text[] not null default '{}'::text[]
    check (cardinality(competency_tags) <= 24),
  prompt_variants text[] not null default '{}'::text[]
    check (cardinality(prompt_variants) <= 20),

  -- Provenance matters: reported interview questions must remain distinguishable
  -- from user-created preparation questions and AI suggestions.
  source_type text not null default 'manual'
    check (source_type in (
      'manual',
      'reported_interview',
      'preparation',
      'real_interview',
      'ai_suggested',
      'imported'
    )),
  source_name text
    check (source_name is null or char_length(trim(source_name)) between 1 and 200),
  source_url text
    check (
      source_url is null
      or (
        char_length(source_url) <= 2000
        and source_url ~* '^https?://'
      )
    ),
  source_observed_at date,
  source_detail text
    check (source_detail is null or char_length(source_detail) <= 4000),

  -- Follow-up tree. Root questions have both columns NULL.
  parent_question_id uuid references public.interview_questions(id) on delete set null,
  follow_up_kind text
    check (follow_up_kind is null or follow_up_kind in (
      'clarify',
      'deep_dive',
      'challenge',
      'counterfactual',
      'pressure',
      'other'
    )),

  difficulty smallint not null default 3
    check (difficulty between 1 and 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  check (
    (parent_question_id is null and follow_up_kind is null)
    or
    (parent_question_id is not null and follow_up_kind is not null)
  ),
  check (parent_question_id is null or parent_question_id <> id),
  check (source_type <> 'reported_interview' or source_name is not null)
);

-- ---------------------------------------------------------------------------
-- 2. Interview contexts (General / Target / Opportunity / Application)
-- ---------------------------------------------------------------------------

create table public.interview_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null
    check (char_length(trim(title)) between 1 and 240),
  context_type text not null
    check (context_type in ('general', 'target', 'direction', 'opportunity', 'application')),

  -- Exactly one Career anchor is used for direction/opportunity/application.
  career_direction_id uuid references public.career_directions(id),
  opportunity_id uuid references public.career_opportunities(id),
  application_id uuid references public.career_applications(id),

  -- Snapshots are presentation/history fields, never a second source of truth.
  -- They are required for a free-standing target context that is not yet in the pipeline.
  organization_snapshot text
    check (organization_snapshot is null or char_length(trim(organization_snapshot)) between 1 and 240),
  role_title_snapshot text
    check (role_title_snapshot is null or char_length(trim(role_title_snapshot)) between 1 and 240),

  default_language text not null default 'zh'
    check (default_language in ('zh', 'en', 'bilingual')),
  priority smallint not null default 3
    check (priority between 1 and 5),
  status text not null default 'active'
    check (status in ('active', 'paused', 'closed')),
  next_interview_at timestamptz,
  notes_markdown text not null default ''
    check (char_length(notes_markdown) <= 100000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  check (
    (context_type = 'general'
      and career_direction_id is null
      and opportunity_id is null
      and application_id is null)
    or
    (context_type = 'target'
      and career_direction_id is null
      and opportunity_id is null
      and application_id is null
      and organization_snapshot is not null
      and role_title_snapshot is not null)
    or
    (context_type = 'direction'
      and career_direction_id is not null
      and opportunity_id is null
      and application_id is null)
    or
    (context_type = 'opportunity'
      and career_direction_id is null
      and opportunity_id is not null
      and application_id is null)
    or
    (context_type = 'application'
      and career_direction_id is null
      and opportunity_id is null
      and application_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- 3. Question preparation: Question × Context
-- ---------------------------------------------------------------------------

create table public.interview_question_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  question_id uuid not null references public.interview_questions(id) on delete cascade,
  context_id uuid references public.interview_contexts(id) on delete cascade,

  prompt_override text
    check (prompt_override is null or char_length(trim(prompt_override)) between 1 and 10000),

  -- Simplified user-facing state. Readiness detail is derived from content/attempts.
  status text not null default 'unprepared'
    check (status in (
      'unprepared',
      'developing',
      'practicing',
      'ready',
      'needs_review',
      'paused'
    )),
  importance text not null default 'normal'
    check (importance in ('low', 'normal', 'high', 'critical')),
  target_language text not null default 'zh'
    check (target_language in ('zh', 'en', 'bilingual')),

  interviewer_intent_markdown text not null default ''
    check (char_length(interviewer_intent_markdown) <= 50000),
  risk_markdown text not null default ''
    check (char_length(risk_markdown) <= 50000),
  working_thoughts_markdown text not null default ''
    check (char_length(working_thoughts_markdown) <= 100000),
  answer_logic_markdown text not null default ''
    check (char_length(answer_logic_markdown) <= 50000),
  key_message text not null default ''
    check (char_length(key_message) <= 5000),
  next_focus text not null default ''
    check (char_length(next_focus) <= 5000),

  confidence smallint
    check (confidence is null or confidence between 1 and 5),
  position integer not null default 0,

  last_practiced_at timestamptz,
  next_practice_at timestamptz,
  ready_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. Thinking / reflection timeline
-- ---------------------------------------------------------------------------

create table public.interview_question_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preparation_id uuid not null references public.interview_question_preparations(id) on delete cascade,

  note_type text not null
    check (note_type in (
      'thinking',
      'insight',
      'research',
      'reflection',
      'interviewer_feedback'
    )),
  body_markdown text not null
    check (char_length(trim(body_markdown)) between 1 and 50000),
  source text not null default 'human'
    check (source in ('human', 'ai', 'real_interview', 'external', 'imported')),
  pinned boolean not null default false,
  occurred_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 5. Versioned answers
-- ---------------------------------------------------------------------------

create table public.interview_answer_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preparation_id uuid not null references public.interview_question_preparations(id) on delete cascade,

  answer_mode text not null
    check (answer_mode in ('outline', 'spoken', 'framework', 'notes')),
  target_seconds integer
    check (target_seconds is null or target_seconds between 10 and 1800),
  language text not null default 'zh'
    check (language in ('zh', 'en', 'bilingual')),

  body_markdown text not null
    check (char_length(trim(body_markdown)) between 1 and 50000),
  version_number integer not null
    check (version_number > 0),

  source text not null default 'human'
    check (source in ('human', 'ai_draft', 'ai_edited', 'imported')),
  status text not null default 'draft'
    check (status in ('draft', 'current', 'retired')),
  change_note text
    check (change_note is null or char_length(change_note) <= 4000),
  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  -- AI output may be stored as a draft, but it cannot become the adopted answer
  -- until the user explicitly confirms it.
  check (
    source not in ('ai_draft', 'ai_edited')
    or status <> 'current'
    or confirmed_at is not null
  )
);

-- ---------------------------------------------------------------------------
-- 6. Mock / real interview sessions
-- ---------------------------------------------------------------------------

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_id uuid references public.interview_contexts(id),

  title text not null
    check (char_length(trim(title)) between 1 and 240),
  session_kind text not null
    check (session_kind in ('mock', 'real')),
  session_format text not null default 'one_to_one'
    check (session_format in (
      'recorded_video',
      'one_to_one',
      'panel',
      'group_interview',
      'group_case',
      'phone',
      'mixed',
      'other'
    )),
  facilitator text not null default 'self'
    check (facilitator in ('self', 'ai', 'human', 'mixed')),
  round_label text
    check (round_label is null or char_length(trim(round_label)) between 1 and 120),
  interviewer_label text
    check (interviewer_label is null or char_length(trim(interviewer_label)) between 1 and 240),
  language_mode text not null default 'zh'
    check (language_mode in ('zh', 'en', 'bilingual')),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),

  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,

  overall_review_markdown text not null default ''
    check (char_length(overall_review_markdown) <= 100000),
  strength_tags text[] not null default '{}'::text[]
    check (cardinality(strength_tags) <= 32),
  issue_tags text[] not null default '{}'::text[]
    check (cardinality(issue_tags) <= 32),
  next_focus text not null default ''
    check (char_length(next_focus) <= 5000),
  notes_markdown text not null default ''
    check (char_length(notes_markdown) <= 100000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  check (ended_at is null or (started_at is not null and ended_at >= started_at)),
  check (status <> 'in_progress' or started_at is not null),
  check (status <> 'completed' or (started_at is not null and ended_at is not null))
);

-- ---------------------------------------------------------------------------
-- 7. Practice / real-answer attempts
-- ---------------------------------------------------------------------------

create table public.interview_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- NULL is intentional: a real interview may contain an unexpected question.
  -- It can be attached to a newly created Preparation during later review.
  preparation_id uuid references public.interview_question_preparations(id) on delete set null,
  session_id uuid references public.interview_sessions(id) on delete set null,
  answer_version_id uuid references public.interview_answer_versions(id) on delete set null,
  parent_attempt_id uuid references public.interview_practice_attempts(id) on delete set null,

  sequence_no integer
    check (sequence_no is null or sequence_no > 0),
  attempt_kind text not null default 'solo'
    check (attempt_kind in ('solo', 'mock', 'real')),
  input_mode text not null default 'text'
    check (input_mode in ('text', 'voice', 'transcript_import')),
  language text not null default 'zh'
    check (language in ('zh', 'en', 'bilingual')),

  prompt_snapshot text not null
    check (char_length(trim(prompt_snapshot)) between 1 and 10000),
  response_transcript_markdown text not null default ''
    check (char_length(response_transcript_markdown) <= 100000),
  duration_seconds integer
    check (duration_seconds is null or duration_seconds between 1 and 7200),

  self_review_markdown text not null default ''
    check (char_length(self_review_markdown) <= 50000),
  feedback_markdown text not null default ''
    check (char_length(feedback_markdown) <= 50000),
  feedback_source text not null default 'none'
    check (feedback_source in ('none', 'self', 'ai', 'human', 'mixed')),

  strength_tags text[] not null default '{}'::text[]
    check (cardinality(strength_tags) <= 32),
  issue_tags text[] not null default '{}'::text[]
    check (cardinality(issue_tags) <= 32),
  next_focus text not null default ''
    check (char_length(next_focus) <= 5000),

  confidence_before smallint
    check (confidence_before is null or confidence_before between 1 and 5),
  confidence_after smallint
    check (confidence_after is null or confidence_after between 1 and 5),

  metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics) = 'object'),
  practiced_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  check (session_id is not null or sequence_no is null),
  check (answer_version_id is null or preparation_id is not null),
  check (parent_attempt_id is null or parent_attempt_id <> id)
);

-- ---------------------------------------------------------------------------
-- Indexes and uniqueness
-- ---------------------------------------------------------------------------

-- Questions
create index interview_questions_owner_category_idx
  on public.interview_questions(user_id, category)
  where archived_at is null;
create index interview_questions_parent_idx
  on public.interview_questions(parent_question_id)
  where parent_question_id is not null and archived_at is null;
create index interview_questions_competency_tags_idx
  on public.interview_questions using gin(competency_tags);

-- Contexts
create index interview_contexts_owner_status_next_idx
  on public.interview_contexts(user_id, status, next_interview_at)
  where archived_at is null;
create index interview_contexts_direction_idx
  on public.interview_contexts(career_direction_id)
  where career_direction_id is not null and archived_at is null;
create index interview_contexts_opportunity_idx
  on public.interview_contexts(opportunity_id)
  where opportunity_id is not null and archived_at is null;
create index interview_contexts_application_idx
  on public.interview_contexts(application_id)
  where application_id is not null and archived_at is null;

-- At most one active catch-all General context per user.
create unique index interview_contexts_active_general_unique_idx
  on public.interview_contexts(user_id)
  where context_type = 'general' and archived_at is null;

-- One active context per concrete pipeline object.
create unique index interview_contexts_active_opportunity_unique_idx
  on public.interview_contexts(user_id, opportunity_id)
  where opportunity_id is not null and archived_at is null;
create unique index interview_contexts_active_application_unique_idx
  on public.interview_contexts(user_id, application_id)
  where application_id is not null and archived_at is null;

-- Preparations
create index interview_preparations_owner_status_due_idx
  on public.interview_question_preparations(user_id, status, next_practice_at)
  where archived_at is null;
create index interview_preparations_question_idx
  on public.interview_question_preparations(question_id)
  where archived_at is null;
create index interview_preparations_context_position_idx
  on public.interview_question_preparations(context_id, position)
  where context_id is not null and archived_at is null;

-- Exactly one active General preparation per Question.
create unique index interview_preparations_general_unique_idx
  on public.interview_question_preparations(user_id, question_id)
  where context_id is null and archived_at is null;

-- Exactly one active preparation per Question × Context.
create unique index interview_preparations_context_unique_idx
  on public.interview_question_preparations(user_id, question_id, context_id)
  where context_id is not null and archived_at is null;

-- Notes: two indexes are intentional. `preparation_id` covers the FK/cascade and
-- per-question timeline; `user_id` covers owner/RLS-oriented history queries.
create index interview_question_notes_preparation_time_idx
  on public.interview_question_notes(preparation_id, occurred_at desc)
  where archived_at is null;

create index interview_question_notes_owner_time_idx
  on public.interview_question_notes(user_id, occurred_at desc)
  where archived_at is null;

-- Answer versions
create index interview_answer_versions_owner_preparation_created_idx
  on public.interview_answer_versions(user_id, preparation_id, created_at desc)
  where archived_at is null;

-- Version numbers are immutable within a specific answer variant. COALESCE gives
-- target_seconds=NULL stable uniqueness semantics.
create unique index interview_answer_versions_variant_version_unique_idx
  on public.interview_answer_versions(
    preparation_id,
    answer_mode,
    language,
    coalesce(target_seconds, -1),
    version_number
  );
-- Only one adopted/current answer per mode-language-duration variant.
create unique index interview_answer_versions_current_unique_idx
  on public.interview_answer_versions(
    preparation_id,
    answer_mode,
    language,
    coalesce(target_seconds, -1)
  )
  where status = 'current' and archived_at is null;

-- Sessions
create index interview_sessions_owner_status_schedule_idx
  on public.interview_sessions(user_id, status, scheduled_at)
  where archived_at is null;
create index interview_sessions_context_started_idx
  on public.interview_sessions(context_id, started_at desc)
  where context_id is not null and archived_at is null;

-- Attempts
create index interview_attempts_owner_practiced_idx
  on public.interview_practice_attempts(user_id, practiced_at desc)
  where archived_at is null;
create index interview_attempts_preparation_practiced_idx
  on public.interview_practice_attempts(preparation_id, practiced_at desc)
  where preparation_id is not null and archived_at is null;
create index interview_attempts_session_sequence_idx
  on public.interview_practice_attempts(session_id, sequence_no)
  where session_id is not null and archived_at is null;
create index interview_attempts_answer_version_idx
  on public.interview_practice_attempts(answer_version_id)
  where answer_version_id is not null and archived_at is null;
create index interview_attempts_parent_idx
  on public.interview_practice_attempts(parent_attempt_id)
  where parent_attempt_id is not null and archived_at is null;
create index interview_attempts_issue_tags_idx
  on public.interview_practice_attempts using gin(issue_tags);

create unique index interview_attempts_session_sequence_unique_idx
  on public.interview_practice_attempts(session_id, sequence_no)
  where session_id is not null
    and sequence_no is not null
    and archived_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse existing Personal OS helper)
-- ---------------------------------------------------------------------------

create trigger interview_questions_updated_at
before update on public.interview_questions
for each row execute function public.set_updated_at();

create trigger interview_contexts_updated_at
before update on public.interview_contexts
for each row execute function public.set_updated_at();

create trigger interview_question_preparations_updated_at
before update on public.interview_question_preparations
for each row execute function public.set_updated_at();

create trigger interview_question_notes_updated_at
before update on public.interview_question_notes
for each row execute function public.set_updated_at();

create trigger interview_answer_versions_updated_at
before update on public.interview_answer_versions
for each row execute function public.set_updated_at();

create trigger interview_sessions_updated_at
before update on public.interview_sessions
for each row execute function public.set_updated_at();

create trigger interview_practice_attempts_updated_at
before update on public.interview_practice_attempts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership/reference integrity trigger
--
-- Direct FK checks do not prove that two rows belong to the same user. This
-- trigger provides defense-in-depth for every nullable/cross-table reference.
-- It is SECURITY INVOKER; it does not bypass RLS.
-- ---------------------------------------------------------------------------

create or replace function public.validate_interview_owner_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'interview_questions' then
    if new.parent_question_id is not null then
      if not exists (
        select 1
        from public.interview_questions q
        where q.id = new.parent_question_id
          and q.user_id = new.user_id
      ) then
        raise exception using errcode = '23514', message = 'parent interview question must belong to the same user';
      end if;

      -- Prevent cycles in the canonical follow-up tree.
      if exists (
        with recursive ancestors(id, parent_question_id) as (
          select q.id, q.parent_question_id
          from public.interview_questions q
          where q.id = new.parent_question_id
          union
          select q.id, q.parent_question_id
          from public.interview_questions q
          join ancestors a on q.id = a.parent_question_id
        )
        select 1 from ancestors where id = new.id
      ) then
        raise exception using errcode = '23514', message = 'interview question follow-up tree cannot contain a cycle';
      end if;
    end if;

  elsif tg_table_name = 'interview_contexts' then
    if new.career_direction_id is not null and not exists (
      select 1 from public.career_directions d
      where d.id = new.career_direction_id and d.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'career direction must belong to the same user';
    end if;

    if new.opportunity_id is not null and not exists (
      select 1 from public.career_opportunities o
      where o.id = new.opportunity_id and o.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'career opportunity must belong to the same user';
    end if;

    if new.application_id is not null and not exists (
      select 1 from public.career_applications a
      where a.id = new.application_id and a.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'career application must belong to the same user';
    end if;

  elsif tg_table_name = 'interview_question_preparations' then
    if not exists (
      select 1 from public.interview_questions q
      where q.id = new.question_id and q.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview question must belong to the same user';
    end if;

    if new.context_id is not null and not exists (
      select 1 from public.interview_contexts c
      where c.id = new.context_id and c.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview context must belong to the same user';
    end if;

  elsif tg_table_name = 'interview_question_notes' then
    if not exists (
      select 1 from public.interview_question_preparations p
      where p.id = new.preparation_id and p.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview preparation must belong to the same user';
    end if;

  elsif tg_table_name = 'interview_answer_versions' then
    if not exists (
      select 1 from public.interview_question_preparations p
      where p.id = new.preparation_id and p.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview preparation must belong to the same user';
    end if;

  elsif tg_table_name = 'interview_sessions' then
    if new.context_id is not null and not exists (
      select 1 from public.interview_contexts c
      where c.id = new.context_id and c.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview context must belong to the same user';
    end if;

  elsif tg_table_name = 'interview_practice_attempts' then
    if new.preparation_id is not null and not exists (
      select 1 from public.interview_question_preparations p
      where p.id = new.preparation_id and p.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview preparation must belong to the same user';
    end if;

    if new.session_id is not null and not exists (
      select 1 from public.interview_sessions s
      where s.id = new.session_id and s.user_id = new.user_id
    ) then
      raise exception using errcode = '23514', message = 'interview session must belong to the same user';
    end if;

    if new.answer_version_id is not null then
      if not exists (
        select 1 from public.interview_answer_versions a
        where a.id = new.answer_version_id
          and a.user_id = new.user_id
          and a.preparation_id = new.preparation_id
      ) then
        raise exception using errcode = '23514', message = 'answer version must belong to the same user and preparation';
      end if;
    end if;

    if new.parent_attempt_id is not null then
      if not exists (
        select 1 from public.interview_practice_attempts a
        where a.id = new.parent_attempt_id
          and a.user_id = new.user_id
          and a.session_id is not distinct from new.session_id
      ) then
        raise exception using errcode = '23514', message = 'parent attempt must belong to the same user and session';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_interview_owner_references() from public, anon, authenticated;

create trigger validate_interview_questions_owner_refs
before insert or update on public.interview_questions
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_contexts_owner_refs
before insert or update on public.interview_contexts
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_preparations_owner_refs
before insert or update on public.interview_question_preparations
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_question_notes_owner_refs
before insert or update on public.interview_question_notes
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_answer_versions_owner_refs
before insert or update on public.interview_answer_versions
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_sessions_owner_refs
before insert or update on public.interview_sessions
for each row execute function public.validate_interview_owner_references();

create trigger validate_interview_attempts_owner_refs
before insert or update on public.interview_practice_attempts
for each row execute function public.validate_interview_owner_references();


-- A Session follow-up tree must be acyclic. Ownership/session consistency is
-- checked by validate_interview_owner_references(); this trigger prevents A→B→A.
create or replace function public.validate_interview_attempt_tree_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_attempt_id is null then
    return new;
  end if;

  if exists (
    with recursive ancestors(id, parent_attempt_id) as (
      select a.id, a.parent_attempt_id
      from public.interview_practice_attempts a
      where a.id = new.parent_attempt_id
        and a.user_id = new.user_id
        and a.session_id is not distinct from new.session_id
      union
      select a.id, a.parent_attempt_id
      from public.interview_practice_attempts a
      join ancestors x on a.id = x.parent_attempt_id
      where a.user_id = new.user_id
        and a.session_id is not distinct from new.session_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514',
      message = 'interview attempt follow-up tree cannot contain a cycle';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_interview_attempt_tree_cycle() from public, anon, authenticated;

create trigger validate_interview_attempt_tree_cycle
before insert or update of parent_attempt_id, session_id, user_id
on public.interview_practice_attempts
for each row execute function public.validate_interview_attempt_tree_cycle();

-- ---------------------------------------------------------------------------
-- Ready-state invariant
--
-- We deliberately DO NOT enforce a rigid edge-by-edge state machine in the DB.
-- The application controls normal transitions. The database only guarantees that
-- status='ready' has the minimum evidence required to mean something.
-- ---------------------------------------------------------------------------

create or replace function public.validate_interview_preparation_ready_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'ready' then
    if char_length(trim(new.key_message)) = 0 then
      raise exception using errcode = '23514', message = 'ready interview preparation requires a key message';
    end if;

    if char_length(trim(new.answer_logic_markdown)) = 0 then
      raise exception using errcode = '23514', message = 'ready interview preparation requires answer logic';
    end if;

    if not exists (
      select 1
      from public.interview_answer_versions a
      where a.preparation_id = new.id
        and a.user_id = new.user_id
        and a.status = 'current'
        and a.archived_at is null
    ) then
      raise exception using errcode = '23514', message = 'ready interview preparation requires a current answer version';
    end if;

    if not exists (
      select 1
      from public.interview_practice_attempts a
      where a.preparation_id = new.id
        and a.user_id = new.user_id
        and a.archived_at is null
    ) then
      raise exception using errcode = '23514', message = 'ready interview preparation requires at least one practice attempt';
    end if;

    if tg_op = 'INSERT' then
      new.ready_at := coalesce(new.ready_at, now());
    elsif old.status is distinct from 'ready' or new.ready_at is null then
      new.ready_at := now();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_interview_preparation_ready_state() from public, anon, authenticated;

create trigger validate_interview_preparation_ready
before insert or update on public.interview_question_preparations
for each row execute function public.validate_interview_preparation_ready_state();

-- ---------------------------------------------------------------------------
-- Keep preparation.last_practiced_at derived from actual attempts.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_interview_preparation_last_practiced()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_preparation_id uuid;
  new_preparation_id uuid;
  target_preparation_id uuid;
  latest_practiced_at timestamptz;
begin
  if tg_op <> 'INSERT' then
    old_preparation_id := old.preparation_id;
  end if;
  if tg_op <> 'DELETE' then
    new_preparation_id := new.preparation_id;
  end if;

  for target_preparation_id in
    select distinct v
    from unnest(array[old_preparation_id, new_preparation_id]) as ids(v)
    where v is not null
  loop
    select max(a.practiced_at)
    into latest_practiced_at
    from public.interview_practice_attempts a
    where a.preparation_id = target_preparation_id
      and a.archived_at is null;

    update public.interview_question_preparations p
    set last_practiced_at = latest_practiced_at,
        status = case
          when p.status = 'ready' and latest_practiced_at is null then 'needs_review'
          else p.status
        end
    where p.id = target_preparation_id;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_interview_preparation_last_practiced() from public, anon, authenticated;

create trigger refresh_interview_preparation_after_attempt_insert
after insert on public.interview_practice_attempts
for each row execute function public.refresh_interview_preparation_last_practiced();

create trigger refresh_interview_preparation_after_attempt_update
after update of preparation_id, practiced_at, archived_at on public.interview_practice_attempts
for each row execute function public.refresh_interview_preparation_last_practiced();

create trigger refresh_interview_preparation_after_attempt_delete
after delete on public.interview_practice_attempts
for each row execute function public.refresh_interview_preparation_last_practiced();

-- If the adopted/current answer disappears, a Ready preparation can no longer
-- honestly remain Ready. Demote it to needs_review; never auto-promote it.
create or replace function public.refresh_interview_preparation_answer_readiness()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_preparation_id uuid;
  new_preparation_id uuid;
  target_preparation_id uuid;
  has_current_answer boolean;
begin
  if tg_op <> 'INSERT' then
    old_preparation_id := old.preparation_id;
  end if;
  if tg_op <> 'DELETE' then
    new_preparation_id := new.preparation_id;
  end if;

  for target_preparation_id in
    select distinct v
    from unnest(array[old_preparation_id, new_preparation_id]) as ids(v)
    where v is not null
  loop
    select exists (
      select 1
      from public.interview_answer_versions a
      where a.preparation_id = target_preparation_id
        and a.status = 'current'
        and a.archived_at is null
    ) into has_current_answer;

    if not has_current_answer then
      update public.interview_question_preparations p
      set status = 'needs_review'
      where p.id = target_preparation_id
        and p.status = 'ready';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_interview_preparation_answer_readiness() from public, anon, authenticated;

create trigger refresh_interview_preparation_after_answer_insert
after insert on public.interview_answer_versions
for each row execute function public.refresh_interview_preparation_answer_readiness();

create trigger refresh_interview_preparation_after_answer_update
after update of preparation_id, status, archived_at on public.interview_answer_versions
for each row execute function public.refresh_interview_preparation_answer_readiness();

create trigger refresh_interview_preparation_after_answer_delete
after delete on public.interview_answer_versions
for each row execute function public.refresh_interview_preparation_answer_readiness();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.interview_questions enable row level security;
alter table public.interview_contexts enable row level security;
alter table public.interview_question_preparations enable row level security;
alter table public.interview_question_notes enable row level security;
alter table public.interview_answer_versions enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_practice_attempts enable row level security;

-- SELECT
create policy "interview_questions_select_own"
on public.interview_questions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_contexts_select_own"
on public.interview_contexts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_preparations_select_own"
on public.interview_question_preparations for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_question_notes_select_own"
on public.interview_question_notes for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_answer_versions_select_own"
on public.interview_answer_versions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_sessions_select_own"
on public.interview_sessions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interview_attempts_select_own"
on public.interview_practice_attempts for select to authenticated
using ((select auth.uid()) = user_id);

-- INSERT
create policy "interview_questions_insert_own"
on public.interview_questions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_contexts_insert_own"
on public.interview_contexts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_preparations_insert_own"
on public.interview_question_preparations for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_question_notes_insert_own"
on public.interview_question_notes for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_answer_versions_insert_own"
on public.interview_answer_versions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_sessions_insert_own"
on public.interview_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "interview_attempts_insert_own"
on public.interview_practice_attempts for insert to authenticated
with check ((select auth.uid()) = user_id);

-- UPDATE
create policy "interview_questions_update_own"
on public.interview_questions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_contexts_update_own"
on public.interview_contexts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_preparations_update_own"
on public.interview_question_preparations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_question_notes_update_own"
on public.interview_question_notes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_answer_versions_update_own"
on public.interview_answer_versions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_sessions_update_own"
on public.interview_sessions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interview_attempts_update_own"
on public.interview_practice_attempts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Explicit table grants
--
-- No authenticated DELETE grant in V1.1. The product archives rows instead.
-- service_role retains DELETE for controlled purge/maintenance flows.
-- ---------------------------------------------------------------------------

revoke all on table public.interview_questions from anon, authenticated, service_role;
revoke all on table public.interview_contexts from anon, authenticated, service_role;
revoke all on table public.interview_question_preparations from anon, authenticated, service_role;
revoke all on table public.interview_question_notes from anon, authenticated, service_role;
revoke all on table public.interview_answer_versions from anon, authenticated, service_role;
revoke all on table public.interview_sessions from anon, authenticated, service_role;
revoke all on table public.interview_practice_attempts from anon, authenticated, service_role;

grant select, insert, update on table public.interview_questions to authenticated;
grant select, insert, update on table public.interview_contexts to authenticated;
grant select, insert, update on table public.interview_question_preparations to authenticated;
grant select, insert, update on table public.interview_question_notes to authenticated;
grant select, insert, update on table public.interview_answer_versions to authenticated;
grant select, insert, update on table public.interview_sessions to authenticated;
grant select, insert, update on table public.interview_practice_attempts to authenticated;

grant select, insert, update, delete on table public.interview_questions to service_role;
grant select, insert, update, delete on table public.interview_contexts to service_role;
grant select, insert, update, delete on table public.interview_question_preparations to service_role;
grant select, insert, update, delete on table public.interview_question_notes to service_role;
grant select, insert, update, delete on table public.interview_answer_versions to service_role;
grant select, insert, update, delete on table public.interview_sessions to service_role;
grant select, insert, update, delete on table public.interview_practice_attempts to service_role;

-- ---------------------------------------------------------------------------
-- Extend polymorphic Career entity links
-- ---------------------------------------------------------------------------

alter table public.entity_links
  drop constraint if exists entity_links_source_type_check,
  drop constraint if exists entity_links_target_type_check;

alter table public.entity_links
  add constraint entity_links_source_type_check check (source_type in (
    'career_direction',
    'career_milestone',
    'career_track',
    'experience',
    'experience_fact',
    'experience_output',
    'experience_bullet',
    'career_opportunity',
    'career_application',
    'resume_version',
    'review',
    'note',
    'document',
    'todo_task',
    'calendar_event',
    'project',
    'task',
    'skill',
    'certification',
    'interview_question',
    'interview_context',
    'interview_preparation',
    'interview_session',
    'interview_attempt',
    'interview_answer_version'
  )),
  add constraint entity_links_target_type_check check (target_type in (
    'career_direction',
    'career_milestone',
    'career_track',
    'experience',
    'experience_fact',
    'experience_output',
    'experience_bullet',
    'career_opportunity',
    'career_application',
    'resume_version',
    'review',
    'note',
    'document',
    'todo_task',
    'calendar_event',
    'project',
    'task',
    'skill',
    'certification',
    'interview_question',
    'interview_context',
    'interview_preparation',
    'interview_session',
    'interview_attempt',
    'interview_answer_version'
  ));

-- ---------------------------------------------------------------------------
-- Defense-in-depth for polymorphic entity_links
--
-- Existing entity_links has no FK because it is polymorphic. This trigger checks
-- that both source and target objects actually belong to entity_links.user_id.
-- Relationship semantics (primary_evidence/supporting_evidence/counter_evidence/
-- tests_skill/source_material/resume_context/etc.) remain an application-level
-- registry because entity_links is shared by multiple Personal OS domains.
-- ---------------------------------------------------------------------------

create or replace function public.validate_entity_link_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_table regclass;
  target_table regclass;
  source_owned boolean;
  target_owned boolean;
begin
  source_table := case new.source_type
    when 'career_direction' then 'public.career_directions'::regclass
    when 'career_milestone' then 'public.career_milestones'::regclass
    when 'career_track' then 'public.career_tracks'::regclass
    when 'experience' then 'public.experiences'::regclass
    when 'experience_fact' then 'public.experience_facts'::regclass
    when 'experience_output' then 'public.experience_outputs'::regclass
    when 'experience_bullet' then 'public.experience_bullets'::regclass
    when 'career_opportunity' then 'public.career_opportunities'::regclass
    when 'career_application' then 'public.career_applications'::regclass
    when 'resume_version' then 'public.resume_versions'::regclass
    when 'review' then 'public.reviews'::regclass
    when 'note' then 'public.notes'::regclass
    when 'document' then 'public.documents'::regclass
    when 'todo_task' then 'public.microsoft_todo_tasks'::regclass
    when 'calendar_event' then 'public.calendar_events'::regclass
    when 'project' then 'public.projects'::regclass
    when 'task' then 'public.tasks'::regclass
    when 'skill' then 'public.skills'::regclass
    when 'certification' then 'public.certifications'::regclass
    when 'interview_question' then 'public.interview_questions'::regclass
    when 'interview_context' then 'public.interview_contexts'::regclass
    when 'interview_preparation' then 'public.interview_question_preparations'::regclass
    when 'interview_session' then 'public.interview_sessions'::regclass
    when 'interview_attempt' then 'public.interview_practice_attempts'::regclass
    when 'interview_answer_version' then 'public.interview_answer_versions'::regclass
  end;

  target_table := case new.target_type
    when 'career_direction' then 'public.career_directions'::regclass
    when 'career_milestone' then 'public.career_milestones'::regclass
    when 'career_track' then 'public.career_tracks'::regclass
    when 'experience' then 'public.experiences'::regclass
    when 'experience_fact' then 'public.experience_facts'::regclass
    when 'experience_output' then 'public.experience_outputs'::regclass
    when 'experience_bullet' then 'public.experience_bullets'::regclass
    when 'career_opportunity' then 'public.career_opportunities'::regclass
    when 'career_application' then 'public.career_applications'::regclass
    when 'resume_version' then 'public.resume_versions'::regclass
    when 'review' then 'public.reviews'::regclass
    when 'note' then 'public.notes'::regclass
    when 'document' then 'public.documents'::regclass
    when 'todo_task' then 'public.microsoft_todo_tasks'::regclass
    when 'calendar_event' then 'public.calendar_events'::regclass
    when 'project' then 'public.projects'::regclass
    when 'task' then 'public.tasks'::regclass
    when 'skill' then 'public.skills'::regclass
    when 'certification' then 'public.certifications'::regclass
    when 'interview_question' then 'public.interview_questions'::regclass
    when 'interview_context' then 'public.interview_contexts'::regclass
    when 'interview_preparation' then 'public.interview_question_preparations'::regclass
    when 'interview_session' then 'public.interview_sessions'::regclass
    when 'interview_attempt' then 'public.interview_practice_attempts'::regclass
    when 'interview_answer_version' then 'public.interview_answer_versions'::regclass
  end;

  if source_table is null or target_table is null then
    raise exception using errcode = '23514', message = 'unsupported entity link type';
  end if;

  execute format(
    'select exists(select 1 from %s where id = $1 and user_id = $2)',
    source_table
  ) into source_owned using new.source_id, new.user_id;

  execute format(
    'select exists(select 1 from %s where id = $1 and user_id = $2)',
    target_table
  ) into target_owned using new.target_id, new.user_id;

  if not coalesce(source_owned, false) then
    raise exception using errcode = '23514', message = 'entity link source must belong to the same user';
  end if;

  if not coalesce(target_owned, false) then
    raise exception using errcode = '23514', message = 'entity link target must belong to the same user';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_entity_link_ownership() from public, anon, authenticated;

drop trigger if exists validate_entity_link_ownership_trigger on public.entity_links;
create trigger validate_entity_link_ownership_trigger
before insert or update of user_id, source_type, source_id, target_type, target_id
on public.entity_links
for each row execute function public.validate_entity_link_ownership();

-- ---------------------------------------------------------------------------
-- Deliberately deferred from V1.1
-- ---------------------------------------------------------------------------
-- 1) No interview_insights table: Insights are derived from Attempts/Sessions.
-- 2) No interview_competencies table: competency/issue/strength tags use an app registry.
-- 3) No global-search trigger yet: add only after Interview Lab UX is stable.
-- 4) No automatic Preparation status promotion/demotion besides the ready invariant.
-- 5) No automatic AI answer promotion.
-- 6) No hard-delete path for authenticated users; future permanent-delete policy should be explicit.
-- 7) Audit logs should store metadata/action IDs only, not full answer/transcript bodies.

-- END PRODUCTION CANDIDATE
