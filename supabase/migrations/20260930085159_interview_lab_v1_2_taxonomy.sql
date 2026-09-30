-- Interview Lab V1.2
-- Separate question type, question style, interview format, competency and evidence.
-- Legacy columns remain as compatibility projections for a later cleanup migration.

create table public.interview_question_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, key),
  unique (user_id, id)
);

alter table public.interview_question_types enable row level security;
create policy interview_question_types_select_own on public.interview_question_types for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_question_types_insert_own on public.interview_question_types for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_question_types_update_own on public.interview_question_types for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_question_types_delete_own on public.interview_question_types for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.interview_question_types to authenticated;

insert into public.interview_question_types (user_id,key,label,description,position)
select u.user_id, v.key, v.label, v.description, v.position
from (select distinct user_id from public.interview_questions) u
cross join (values
  ('resume','简历','履历事实、经历边界与贡献',10),
  ('behavioral','行为','用过去行为证明能力与工作方式',20),
  ('motivation_fit','动机 / Fit','动机、职业选择、自我认知与组织匹配',30),
  ('knowledge','专业 / Knowledge','专业与行业知识',40),
  ('business_case','商业 / Case','商业判断、案例分析与结构化解决问题',50),
  ('situational','情景','假设情景下的判断与应对',60),
  ('candidate_question','反问','候选人向面试官提出的问题',70)
) as v(key,label,description,position)
on conflict (user_id,key) do nothing;

alter table public.interview_questions
  add column question_type_id uuid,
  add column question_style text not null default 'standard'
    check (question_style in ('standard','stress'));

update public.interview_questions q
set question_type_id = qt.id,
    question_style = case when q.category='stress' or q.follow_up_kind='pressure' then 'stress' else 'standard' end
from public.interview_question_types qt
where qt.user_id=q.user_id
  and qt.key = case
    when q.category='resume' then 'resume'
    when q.category='behavioral' then 'behavioral'
    when q.category='motivation_fit' then 'motivation_fit'
    when q.category='knowledge' then 'knowledge'
    when q.category='business_commercial' then 'business_case'
    when q.category='situational' then 'situational'
    when q.category='interviewer_question' then 'candidate_question'
    when q.category='stress' and q.subcategory='career_consistency' then 'motivation_fit'
    when q.category='stress' and q.subcategory='leadership_without_authority' then 'behavioral'
    when q.category='stress' then 'resume'
  end;

alter table public.interview_questions
  alter column question_type_id set not null,
  add constraint interview_questions_user_id_id_key unique (user_id,id),
  add constraint interview_questions_user_question_type_fkey
    foreign key (user_id,question_type_id)
    references public.interview_question_types(user_id,id);

create index interview_questions_question_type_idx on public.interview_questions(user_id,question_type_id) where archived_at is null;
create index interview_questions_question_style_idx on public.interview_questions(user_id,question_style) where archived_at is null;

create or replace function public.interview_sync_question_taxonomy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  type_key text;
begin
  if new.question_type_id is null then
    type_key := case
      when new.category='resume' then 'resume'
      when new.category='behavioral' then 'behavioral'
      when new.category='motivation_fit' then 'motivation_fit'
      when new.category='knowledge' then 'knowledge'
      when new.category='business_commercial' then 'business_case'
      when new.category='situational' then 'situational'
      when new.category='interviewer_question' then 'candidate_question'
      when new.category='stress' and new.subcategory='career_consistency' then 'motivation_fit'
      when new.category='stress' and new.subcategory='leadership_without_authority' then 'behavioral'
      when new.category='stress' then 'resume'
      else 'behavioral'
    end;

    select id into new.question_type_id
    from public.interview_question_types
    where user_id=new.user_id and key=type_key and archived_at is null
    limit 1;
  end if;

  if new.category='stress' or new.follow_up_kind='pressure' then
    new.question_style := 'stress';
  elsif new.question_style is null then
    new.question_style := 'standard';
  end if;

  if new.question_type_id is null then
    raise exception 'Interview question type registry is missing for user';
  end if;
  return new;
end $$;

create trigger interview_questions_sync_taxonomy
before insert or update of user_id,category,subcategory,follow_up_kind,question_type_id,question_style
on public.interview_questions
for each row execute function public.interview_sync_question_taxonomy();

create table public.interview_competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(trim(label)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1200),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id,key),
  unique (user_id,id)
);

alter table public.interview_competencies enable row level security;
create policy interview_competencies_select_own on public.interview_competencies for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_competencies_insert_own on public.interview_competencies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_competencies_update_own on public.interview_competencies for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_competencies_delete_own on public.interview_competencies for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.interview_competencies to authenticated;

insert into public.interview_competencies (user_id,key,label,position)
select u.user_id, v.key, v.label, v.position
from (select distinct user_id from public.interview_questions) u
cross join (values
  ('adaptability','适应力',10),('career_judgment','职业判断',20),('commercial_awareness','商业敏感度',30),
  ('commercial_judgment','商业判断',40),('communication','沟通表达',50),('curiosity','好奇心',60),
  ('customer_insight','客户洞察',70),('execution','执行力',80),('humility','谦逊与开放',90),
  ('influence_without_authority','无职权影响力',100),('judgment','判断力',110),('leadership','领导力',120),
  ('learning_agility','学习敏捷度',130),('motivation','求职动机',140),('ownership','主人翁意识',150),
  ('prioritization','优先级管理',160),('problem_solving','问题解决',170),('resilience','韧性',180),
  ('self_awareness','自我认知',190),('stakeholder_management','利益相关方管理',200),
  ('structured_thinking','结构化思考',210)
) as v(key,label,position)
on conflict (user_id,key) do nothing;

insert into public.interview_competencies (user_id,key,label,position)
select distinct q.user_id,tag,initcap(replace(tag,'_',' ')),1000
from public.interview_questions q
cross join lateral unnest(q.competency_tags) tag
where tag ~ '^[a-z][a-z0-9_]{1,63}$'
on conflict (user_id,key) do nothing;

create table public.interview_question_competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null,
  competency_id uuid not null,
  relevance smallint not null default 3 check (relevance between 1 and 5),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id,competency_id),
  foreign key (user_id,question_id) references public.interview_questions(user_id,id) on delete cascade,
  foreign key (user_id,competency_id) references public.interview_competencies(user_id,id) on delete cascade
);

alter table public.interview_question_competencies enable row level security;
create policy interview_question_competencies_select_own on public.interview_question_competencies for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_question_competencies_insert_own on public.interview_question_competencies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_question_competencies_update_own on public.interview_question_competencies for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_question_competencies_delete_own on public.interview_question_competencies for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.interview_question_competencies to authenticated;
create index interview_question_competencies_question_idx on public.interview_question_competencies(user_id,question_id);
create index interview_question_competencies_competency_idx on public.interview_question_competencies(user_id,competency_id);

insert into public.interview_question_competencies (user_id,question_id,competency_id,relevance,is_primary)
select q.user_id,q.id,c.id,
  case ord when 1 then 5 when 2 then 4 else 3 end,
  ord=1
from public.interview_questions q
cross join lateral unnest(q.competency_tags) with ordinality t(tag,ord)
join public.interview_competencies c on c.user_id=q.user_id and c.key=t.tag
on conflict (question_id,competency_id) do nothing;

create or replace function public.interview_sync_question_competencies()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.interview_competencies(user_id,key,label,position)
  select distinct new.user_id,tag,initcap(replace(tag,'_',' ')),1000
  from unnest(new.competency_tags) tag
  where tag ~ '^[a-z][a-z0-9_]{1,63}$'
  on conflict(user_id,key) do nothing;

  delete from public.interview_question_competencies qc
  using public.interview_competencies c
  where qc.question_id=new.id
    and qc.competency_id=c.id
    and not (c.key = any(new.competency_tags));

  insert into public.interview_question_competencies(user_id,question_id,competency_id,relevance,is_primary)
  select new.user_id,new.id,c.id,
    case ord when 1 then 5 when 2 then 4 else 3 end,
    ord=1
  from unnest(new.competency_tags) with ordinality t(tag,ord)
  join public.interview_competencies c on c.user_id=new.user_id and c.key=t.tag
  on conflict(question_id,competency_id) do update
    set relevance=excluded.relevance,is_primary=excluded.is_primary,updated_at=now();
  return new;
end $$;

create trigger interview_questions_sync_competencies
after insert or update of competency_tags
on public.interview_questions
for each row execute function public.interview_sync_question_competencies();

create table public.interview_formats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  participant_mode text not null default 'individual'
    check (participant_mode in ('individual','panel','group','async','other')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id,key),
  unique (user_id,id)
);

alter table public.interview_formats enable row level security;
create policy interview_formats_select_own on public.interview_formats for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_formats_insert_own on public.interview_formats for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_formats_update_own on public.interview_formats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_formats_delete_own on public.interview_formats for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.interview_formats to authenticated;

insert into public.interview_formats (user_id,key,label,participant_mode,position)
select u.user_id,v.key,v.label,v.participant_mode,v.position
from (
  select distinct user_id from public.interview_questions
  union select distinct user_id from public.interview_sessions
) u
cross join (values
  ('one_to_one','1v1','individual',10),
  ('panel','Panel','panel',20),
  ('group_interview','群面','group',30),
  ('group_case','群组案例','group',40),
  ('recorded_video','录制视频','async',50),
  ('phone','电话','individual',60),
  ('mixed','混合','other',70),
  ('other','其他','other',80)
) as v(key,label,participant_mode,position)
on conflict (user_id,key) do nothing;

alter table public.interview_sessions add column format_id uuid;

update public.interview_sessions s
set format_id=f.id
from public.interview_formats f
where f.user_id=s.user_id and f.key=s.session_format;

alter table public.interview_sessions
  add constraint interview_sessions_user_format_fkey
    foreign key (user_id,format_id) references public.interview_formats(user_id,id);

create index interview_sessions_format_idx on public.interview_sessions(user_id,format_id) where archived_at is null;

create or replace function public.interview_sync_session_format()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.format_id is null then
    select id into new.format_id
    from public.interview_formats
    where user_id=new.user_id and key=new.session_format and archived_at is null
    limit 1;
  end if;
  return new;
end $$;

create trigger interview_sessions_sync_format
before insert or update of user_id,session_format,format_id
on public.interview_sessions
for each row execute function public.interview_sync_session_format();

alter table public.interview_question_preparations
  add constraint interview_question_preparations_user_id_id_key unique(user_id,id);
alter table public.entity_links
  add constraint entity_links_user_id_id_key unique(user_id,id);

create table public.interview_evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preparation_id uuid not null,
  entity_link_id uuid not null,
  evidence_role text not null
    check (evidence_role in ('primary','supporting','counter','source','resume_context')),
  note text not null default '' check (char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (entity_link_id),
  foreign key (user_id,preparation_id)
    references public.interview_question_preparations(user_id,id) on delete cascade,
  foreign key (user_id,entity_link_id)
    references public.entity_links(user_id,id) on delete cascade
);

alter table public.interview_evidence_links enable row level security;
create policy interview_evidence_links_select_own on public.interview_evidence_links for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_evidence_links_insert_own on public.interview_evidence_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_evidence_links_update_own on public.interview_evidence_links for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_evidence_links_delete_own on public.interview_evidence_links for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.interview_evidence_links to authenticated;
create index interview_evidence_links_preparation_idx on public.interview_evidence_links(user_id,preparation_id) where archived_at is null;\ncreate index interview_evidence_links_entity_link_idx on public.interview_evidence_links(user_id,entity_link_id);

insert into public.interview_evidence_links(user_id,preparation_id,entity_link_id,evidence_role)
select el.user_id,el.source_id,el.id,
  case el.relationship_type
    when 'primary_evidence' then 'primary'
    when 'supporting_evidence' then 'supporting'
    when 'counter_evidence' then 'counter'
    when 'source_material' then 'source'
    when 'resume_context' then 'resume_context'
  end
from public.entity_links el
join public.interview_question_preparations p on p.id=el.source_id and p.user_id=el.user_id
where el.source_type='interview_preparation'
  and el.relationship_type in ('primary_evidence','supporting_evidence','counter_evidence','source_material','resume_context')
  and el.archived_at is null
on conflict(entity_link_id) do nothing;

create or replace function public.interview_sync_evidence_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  evidence_role_value text;
begin
  evidence_role_value := case new.relationship_type
    when 'primary_evidence' then 'primary'
    when 'supporting_evidence' then 'supporting'
    when 'counter_evidence' then 'counter'
    when 'source_material' then 'source'
    when 'resume_context' then 'resume_context'
    else null
  end;

  if new.source_type='interview_preparation' and evidence_role_value is not null and new.archived_at is null then
    insert into public.interview_evidence_links(user_id,preparation_id,entity_link_id,evidence_role,archived_at)
    values(new.user_id,new.source_id,new.id,evidence_role_value,null)
    on conflict(entity_link_id) do update
      set evidence_role=excluded.evidence_role,archived_at=null,updated_at=now();
  else
    update public.interview_evidence_links
    set archived_at=coalesce(new.archived_at,now()),updated_at=now()
    where entity_link_id=new.id and archived_at is null;
  end if;
  return new;
end $$;

create trigger entity_links_sync_interview_evidence
after insert or update of source_type,source_id,relationship_type,archived_at
on public.entity_links
for each row execute function public.interview_sync_evidence_link();

do $$
begin
  if exists(select 1 from public.interview_questions where question_type_id is null) then
    raise exception 'Interview taxonomy migration left questions without question_type_id';
  end if;

  if exists(
    select 1
    from public.interview_questions q
    cross join lateral unnest(q.competency_tags) t(tag)
    where not exists(
      select 1
      from public.interview_question_competencies qc
      join public.interview_competencies c on c.id=qc.competency_id
      where qc.question_id=q.id and c.key=t.tag
    )
  ) then
    raise exception 'Interview taxonomy migration left competency tags without normalized links';
  end if;

  if exists(
    select 1
    from public.interview_evidence_links iel
    join public.entity_links el on el.id=iel.entity_link_id
    where el.source_type<>'interview_preparation' or el.source_id<>iel.preparation_id
  ) then
    raise exception 'Interview evidence normalization produced mismatched links';
  end if;
end $$;
