-- Interview Lab: version-pinned narrative lineage and factual evidence.
-- Additive schema only; no answer/status edits and no production credentials.
create table public.interview_narratives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  master_preparation_id uuid not null references public.interview_question_preparations(id),
  selected_version_id uuid not null references public.interview_answer_versions(id),
  title text not null default '核心自我介绍',
  review_status text not null default 'draft' check (review_status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint interview_narratives_owner_master_unique unique(user_id, master_preparation_id),
  constraint interview_narratives_title_length check (char_length(title) between 1 and 240)
);

create table public.interview_answer_narrative_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  narrative_id uuid not null references public.interview_narratives(id),
  answer_version_id uuid not null references public.interview_answer_versions(id),
  based_on_version_id uuid not null references public.interview_answer_versions(id),
  review_state text not null default 'unreviewed' check (review_state in ('unreviewed','reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint interview_answer_narrative_links_one_active unique(user_id, answer_version_id)
);

create table public.interview_answer_fact_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_version_id uuid not null references public.interview_answer_versions(id),
  fact_id uuid not null references public.experience_facts(id),
  fact_version_id uuid not null references public.experience_fact_versions(id),
  review_state text not null default 'unreviewed' check (review_state in ('unreviewed','reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint interview_answer_fact_links_one_active unique(user_id, answer_version_id, fact_id)
);

-- Cross-entity ownership and version attribution are enforced by the database,
-- not by the browser, string IDs or permissive RLS alone.
create function public.validate_interview_narrative_refs()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.interview_question_preparations p
    join public.interview_answer_versions v on v.preparation_id = p.id
    where p.id = new.master_preparation_id
      and v.id = new.selected_version_id
      and p.user_id = new.user_id and v.user_id = new.user_id
      and p.context_id is null and p.archived_at is null
      and v.answer_mode = 'spoken' and v.archived_at is null
  ) then
    raise exception 'Invalid narrative master or version' using errcode = '23514';
  end if;
  if new.review_status = 'approved' and not exists (
    select 1 from public.interview_answer_versions v
    where v.id = new.selected_version_id and v.status = 'current' and v.confirmed_at is not null
  ) then
    raise exception 'An unconfirmed answer cannot be an approved narrative' using errcode = '23514';
  end if;
  return new;
end; $$;

create function public.validate_interview_answer_narrative_link_refs()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.interview_narratives n
    join public.interview_answer_versions base on base.preparation_id = n.master_preparation_id
    join public.interview_answer_versions target on target.id = new.answer_version_id
    join public.interview_question_preparations p on p.id = target.preparation_id
    join public.interview_question_preparations master_p on master_p.id = n.master_preparation_id
    where n.id = new.narrative_id and n.user_id = new.user_id
      and base.id = new.based_on_version_id and base.user_id = new.user_id
      and target.user_id = new.user_id and p.user_id = new.user_id
      and p.context_id is not null and p.question_id = master_p.question_id
      and master_p.user_id = new.user_id
      and base.answer_mode = 'spoken' and target.answer_mode = 'spoken'
      and target.archived_at is null
  ) then
    raise exception 'Invalid target answer or master version ownership' using errcode = '23514';
  end if;
  if new.review_state = 'reviewed' and not exists (
    select 1 from public.interview_narratives n
    where n.id = new.narrative_id and n.selected_version_id = new.based_on_version_id
  ) then
    raise exception 'Cannot review a link against a different baseline' using errcode = '23514';
  end if;
  return new;
end; $$;

create function public.validate_interview_answer_fact_link_refs()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.interview_answer_versions v
    join public.experience_facts f on f.user_id = v.user_id
    join public.experience_fact_versions fv on fv.fact_id = f.id and fv.user_id = f.user_id
    where v.id = new.answer_version_id and v.user_id = new.user_id
      and f.id = new.fact_id and fv.id = new.fact_version_id
  ) then
    raise exception 'Invalid answer / fact / fact version ownership' using errcode = '23514';
  end if;
  if new.review_state = 'reviewed' and not exists (
    select 1 from public.experience_facts f
    where f.id = new.fact_id and f.verification_status in ('self_confirmed','document_verified','externally_verified')
  ) then
    raise exception 'Fact must be confirmed before review' using errcode = '23514';
  end if;
  return new;
end; $$;

create trigger interview_narratives_validate_refs
before insert or update on public.interview_narratives
for each row execute function public.validate_interview_narrative_refs();
create trigger interview_answer_narrative_links_validate_refs
before insert or update on public.interview_answer_narrative_links
for each row execute function public.validate_interview_answer_narrative_link_refs();
create trigger interview_answer_fact_links_validate_refs
before insert or update on public.interview_answer_fact_links
for each row execute function public.validate_interview_answer_fact_link_refs();

create trigger interview_narratives_updated_at
before update on public.interview_narratives for each row execute function public.set_updated_at();
create trigger interview_answer_narrative_links_updated_at
before update on public.interview_answer_narrative_links for each row execute function public.set_updated_at();
create trigger interview_answer_fact_links_updated_at
before update on public.interview_answer_fact_links for each row execute function public.set_updated_at();

create index interview_answer_narrative_links_owner_narrative_idx
 on public.interview_answer_narrative_links(user_id, narrative_id) where archived_at is null;
create index interview_answer_fact_links_owner_answer_idx
 on public.interview_answer_fact_links(user_id, answer_version_id) where archived_at is null;
create index interview_answer_fact_links_owner_fact_idx
 on public.interview_answer_fact_links(user_id, fact_id) where archived_at is null;

alter table public.interview_narratives enable row level security;
alter table public.interview_answer_narrative_links enable row level security;
alter table public.interview_answer_fact_links enable row level security;
alter table public.interview_narratives force row level security;
alter table public.interview_answer_narrative_links force row level security;
alter table public.interview_answer_fact_links force row level security;

create policy interview_narratives_select_own on public.interview_narratives
for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_narratives_insert_own on public.interview_narratives
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_narratives_update_own on public.interview_narratives
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy interview_answer_narrative_links_select_own on public.interview_answer_narrative_links
for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_answer_narrative_links_insert_own on public.interview_answer_narrative_links
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_answer_narrative_links_update_own on public.interview_answer_narrative_links
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy interview_answer_fact_links_select_own on public.interview_answer_fact_links
for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_answer_fact_links_insert_own on public.interview_answer_fact_links
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_answer_fact_links_update_own on public.interview_answer_fact_links
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.interview_narratives,
  public.interview_answer_narrative_links, public.interview_answer_fact_links to authenticated;
grant select, insert, update, delete on public.interview_narratives,
  public.interview_answer_narrative_links, public.interview_answer_fact_links to service_role;

-- Reconstruct only the first already-created reviewable draft batch. No ids or
-- private content are embedded in the migration; all old answers remain unchanged.
with source_rows as (
 select distinct on (v.user_id, p.id) v.user_id, p.id master_preparation_id, v.id selected_version_id
 from public.interview_answer_versions v
 join public.interview_question_preparations p on p.id = v.preparation_id and p.user_id = v.user_id
 where p.context_id is null and p.archived_at is null
   and v.answer_mode = 'spoken' and v.archived_at is null
   and v.change_note like 'NARRATIVE_20261021_V1_MASTER%'
 order by v.user_id, p.id, v.version_number desc
)
insert into public.interview_narratives(user_id, master_preparation_id, selected_version_id, title)
select user_id, master_preparation_id, selected_version_id, '自我介绍 · 统一叙事' from source_rows
on conflict (user_id,master_preparation_id) do nothing;

insert into public.interview_answer_narrative_links
  (user_id, narrative_id, answer_version_id, based_on_version_id, review_state)
select v.user_id, n.id, v.id, n.selected_version_id, 'unreviewed'
from public.interview_answer_versions v
join public.interview_question_preparations p on p.id = v.preparation_id and p.user_id = v.user_id
join public.interview_narratives n on n.user_id = v.user_id and n.archived_at is null
join public.interview_question_preparations master_p on master_p.id = n.master_preparation_id
  and master_p.question_id = p.question_id
where p.context_id is not null and p.archived_at is null
  and v.answer_mode = 'spoken' and v.archived_at is null
  and v.change_note like 'NARRATIVE_20261021_V1_TARGET%'
on conflict (user_id,answer_version_id) do nothing;
