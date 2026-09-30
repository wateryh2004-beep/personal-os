create table public.interview_question_archetypes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,79}$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  primary_question_type_id uuid not null,
  intent_markdown text not null default '' check (char_length(intent_markdown) <= 20000),
  answer_framework_markdown text not null default '' check (char_length(answer_framework_markdown) <= 30000),
  status text not null default 'active' check (status in ('active','needs_review','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(user_id,key),
  unique(user_id,id),
  foreign key(user_id,primary_question_type_id)
    references public.interview_question_types(user_id,id)
);
alter table public.interview_question_archetypes enable row level security;
create policy interview_archetypes_select_own on public.interview_question_archetypes for select to authenticated using ((select auth.uid())=user_id);
create policy interview_archetypes_insert_own on public.interview_question_archetypes for insert to authenticated with check ((select auth.uid())=user_id);
create policy interview_archetypes_update_own on public.interview_question_archetypes for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy interview_archetypes_delete_own on public.interview_question_archetypes for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.interview_question_archetypes to authenticated;
create index interview_archetypes_type_idx on public.interview_question_archetypes(user_id,primary_question_type_id) where archived_at is null;

insert into public.interview_question_archetypes(user_id,key,title,primary_question_type_id,answer_framework_markdown)
select q.user_id,
       'question_' || substr(replace(q.id::text,'-',''),1,12),
       coalesce(nullif(trim(q.short_title),''),left(q.canonical_prompt,160)),
       q.question_type_id,
       coalesce((select p.answer_logic_markdown
                 from public.interview_question_preparations p
                 where p.question_id=q.id and p.archived_at is null and p.answer_logic_markdown<>''
                 order by p.updated_at desc limit 1),'')
from public.interview_questions q
where q.parent_question_id is null
on conflict(user_id,key) do nothing;

alter table public.interview_questions
  add column archetype_id uuid,
  add column variant_kind text not null default 'canonical'
    check (variant_kind in ('canonical','alternate','company_specific','follow_up','pressure','observed'));

with recursive ancestry as (
  select q.id,q.id as root_id
  from public.interview_questions q
  where q.parent_question_id is null
  union all
  select child.id,a.root_id
  from public.interview_questions child
  join ancestry a on child.parent_question_id=a.id
)
update public.interview_questions q
set archetype_id=a2.id,
    variant_kind=case
      when q.question_style='stress' then 'pressure'
      when q.parent_question_id is not null then 'follow_up'
      else 'canonical'
    end
from ancestry x, public.interview_question_archetypes a2
where q.id=x.id
  and a2.user_id=q.user_id
  and a2.key='question_' || substr(replace(x.root_id::text,'-',''),1,12);

do $$
declare target_a uuid; source_a uuid;
begin
  select archetype_id into target_a from public.interview_questions
   where id='d921296e-e7da-4ff3-b939-d353e49ff9c1';
  select archetype_id into source_a from public.interview_questions
   where id='97a2fb5e-b19f-48da-9d68-c00504451370';
  if target_a is not null and source_a is not null and target_a<>source_a then
    update public.interview_questions
      set archetype_id=target_a, variant_kind='alternate'
      where archetype_id=source_a;
    update public.interview_question_archetypes
      set archived_at=now(),status='archived',updated_at=now()
      where id=source_a;
    update public.interview_question_archetypes
      set title='快速学习并应用新技能',updated_at=now()
      where id=target_a;
  end if;
end $$;

alter table public.interview_questions
  alter column archetype_id set not null,
  add constraint interview_questions_user_archetype_fkey
    foreign key(user_id,archetype_id)
    references public.interview_question_archetypes(user_id,id);

create index interview_questions_archetype_idx on public.interview_questions(user_id,archetype_id) where archived_at is null;
create index interview_questions_variant_kind_idx on public.interview_questions(user_id,variant_kind) where archived_at is null;

create or replace function public.interview_sync_question_archetype()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  parent_archetype uuid;
  archetype_key text;
begin
  if new.archetype_id is null and new.parent_question_id is not null then
    select archetype_id into parent_archetype
    from public.interview_questions
    where id=new.parent_question_id and user_id=new.user_id;
    new.archetype_id := parent_archetype;
  end if;

  if new.archetype_id is null then
    archetype_key := 'question_' || substr(replace(new.id::text,'-',''),1,12);
    insert into public.interview_question_archetypes(
      user_id,key,title,primary_question_type_id
    ) values(
      new.user_id,
      archetype_key,
      coalesce(nullif(trim(new.short_title),''),left(new.canonical_prompt,160)),
      new.question_type_id
    )
    on conflict(user_id,key) do update set updated_at=now()
    returning id into new.archetype_id;
  end if;

  if new.variant_kind is null or new.variant_kind='canonical' then
    new.variant_kind := case
      when new.question_style='stress' then 'pressure'
      when new.parent_question_id is not null then 'follow_up'
      else coalesce(new.variant_kind,'canonical')
    end;
  end if;
  return new;
end $$;

create trigger zz_interview_questions_sync_archetype
before insert or update of user_id,parent_question_id,archetype_id,variant_kind,question_style,question_type_id,short_title,canonical_prompt
on public.interview_questions
for each row execute function public.interview_sync_question_archetype();

alter table public.experiences
  add constraint experiences_user_id_id_key unique(user_id,id);

create table public.interview_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 180),
  one_line text not null default '' check (char_length(one_line) <= 800),
  situation_markdown text not null default '' check (char_length(situation_markdown) <= 20000),
  task_markdown text not null default '' check (char_length(task_markdown) <= 20000),
  action_markdown text not null default '' check (char_length(action_markdown) <= 40000),
  result_markdown text not null default '' check (char_length(result_markdown) <= 20000),
  reflection_markdown text not null default '' check (char_length(reflection_markdown) <= 20000),
  status text not null default 'draft' check (status in ('draft','usable','strong','needs_review')),
  last_refined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(user_id,id),
  foreign key(user_id,experience_id) references public.experiences(user_id,id) on delete set null
);
alter table public.interview_stories enable row level security;
create policy interview_stories_select_own on public.interview_stories for select to authenticated using ((select auth.uid())=user_id);
create policy interview_stories_insert_own on public.interview_stories for insert to authenticated with check ((select auth.uid())=user_id);
create policy interview_stories_update_own on public.interview_stories for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy interview_stories_delete_own on public.interview_stories for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.interview_stories to authenticated;
create index interview_stories_experience_idx on public.interview_stories(user_id,experience_id) where archived_at is null;
create index interview_stories_status_idx on public.interview_stories(user_id,status) where archived_at is null;

create table public.interview_story_competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null,
  competency_id uuid not null,
  relevance smallint not null default 3 check (relevance between 1 and 5),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(story_id,competency_id),
  foreign key(user_id,story_id) references public.interview_stories(user_id,id) on delete cascade,
  foreign key(user_id,competency_id) references public.interview_competencies(user_id,id) on delete cascade
);
alter table public.interview_story_competencies enable row level security;
create policy interview_story_competencies_select_own on public.interview_story_competencies for select to authenticated using ((select auth.uid())=user_id);
create policy interview_story_competencies_insert_own on public.interview_story_competencies for insert to authenticated with check ((select auth.uid())=user_id);
create policy interview_story_competencies_update_own on public.interview_story_competencies for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy interview_story_competencies_delete_own on public.interview_story_competencies for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.interview_story_competencies to authenticated;
create index interview_story_competencies_story_idx on public.interview_story_competencies(user_id,story_id);
create index interview_story_competencies_competency_idx on public.interview_story_competencies(user_id,competency_id);

create table public.interview_archetype_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archetype_id uuid not null,
  story_id uuid not null,
  evidence_role text not null default 'supporting' check (evidence_role in ('primary','supporting','counter')),
  fit_note text not null default '' check (char_length(fit_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(archetype_id,story_id),
  foreign key(user_id,archetype_id) references public.interview_question_archetypes(user_id,id) on delete cascade,
  foreign key(user_id,story_id) references public.interview_stories(user_id,id) on delete cascade
);
alter table public.interview_archetype_stories enable row level security;
create policy interview_archetype_stories_select_own on public.interview_archetype_stories for select to authenticated using ((select auth.uid())=user_id);
create policy interview_archetype_stories_insert_own on public.interview_archetype_stories for insert to authenticated with check ((select auth.uid())=user_id);
create policy interview_archetype_stories_update_own on public.interview_archetype_stories for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy interview_archetype_stories_delete_own on public.interview_archetype_stories for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.interview_archetype_stories to authenticated;
create index interview_archetype_stories_archetype_idx on public.interview_archetype_stories(user_id,archetype_id) where archived_at is null;
create index interview_archetype_stories_story_idx on public.interview_archetype_stories(user_id,story_id) where archived_at is null;

alter table public.interview_practice_attempts add column story_id uuid;
alter table public.interview_practice_attempts
  add constraint interview_attempts_user_story_fkey
  foreign key(user_id,story_id) references public.interview_stories(user_id,id) on delete set null;
create index interview_attempts_story_idx on public.interview_practice_attempts(user_id,story_id) where archived_at is null;

alter table public.entity_links drop constraint entity_links_source_type_check;
alter table public.entity_links add constraint entity_links_source_type_check check (
  source_type = any(array[
    'career_direction','career_milestone','career_track','experience','experience_fact','experience_output',
    'experience_bullet','career_opportunity','career_application','resume_version','review','note','document',
    'todo_task','calendar_event','project','task','skill','certification','interview_question','interview_context',
    'interview_preparation','interview_session','interview_attempt','interview_answer_version',
    'interview_archetype','interview_story'
  ]::text[])
);
alter table public.entity_links drop constraint entity_links_target_type_check;
alter table public.entity_links add constraint entity_links_target_type_check check (
  target_type = any(array[
    'career_direction','career_milestone','career_track','experience','experience_fact','experience_output',
    'experience_bullet','career_opportunity','career_application','resume_version','review','note','document',
    'todo_task','calendar_event','project','task','skill','certification','interview_question','interview_context',
    'interview_preparation','interview_session','interview_attempt','interview_answer_version',
    'interview_archetype','interview_story'
  ]::text[])
);

do $$
declare
  active_questions int;
  questions_without_archetype int;
  active_archetypes int;
  learning_archetypes int;
begin
  select count(*) into active_questions from public.interview_questions where archived_at is null;
  select count(*) into questions_without_archetype from public.interview_questions where archetype_id is null;
  select count(*) into active_archetypes from public.interview_question_archetypes where archived_at is null;
  select count(distinct archetype_id) into learning_archetypes
    from public.interview_questions
    where id in ('d921296e-e7da-4ff3-b939-d353e49ff9c1','97a2fb5e-b19f-48da-9d68-c00504451370');
  if questions_without_archetype<>0 then raise exception 'missing archetype links: %',questions_without_archetype; end if;
  if learning_archetypes<>1 then raise exception 'learning duplicate not merged'; end if;
  if active_archetypes>=active_questions then raise exception 'archetype normalization did not reduce question roots'; end if;
end $$;
