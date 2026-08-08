-- Career Module Phase 1 and reusable document/link foundations.
-- This migration deliberately does not create a Storage bucket. Create the
-- private `private-files` bucket in the Supabase dashboard before uploads.

create type public.career_direction_status as enum ('exploring', 'active', 'paused', 'deprioritized', 'rejected', 'archived');
create type public.experience_type as enum ('education', 'internship', 'employment', 'project', 'campus', 'research', 'volunteer', 'other');
create type public.career_record_status as enum ('draft', 'confirmed', 'archived');
create type public.confidentiality_level as enum ('private', 'sensitive', 'public_safe');
create type public.fact_type as enum ('responsibility', 'action', 'tool', 'scale', 'metric', 'collaboration', 'process', 'result', 'context', 'other');
create type public.verification_status as enum ('unverified', 'self_confirmed', 'document_verified', 'externally_verified');
create type public.output_type as enum ('report', 'presentation', 'product', 'code', 'analysis', 'document', 'event', 'process', 'publication', 'dataset', 'other');
create type public.bullet_status as enum ('draft', 'approved', 'rejected', 'archived');
create type public.bullet_source as enum ('human', 'ai_draft', 'ai_edited');
create type public.skill_category as enum ('technical', 'analytical', 'business', 'communication', 'language', 'domain', 'tool', 'other');
create type public.skill_proficiency as enum ('learning', 'basic', 'working', 'proficient', 'advanced');
create type public.certification_status as enum ('planned', 'registered', 'preparing', 'passed', 'failed', 'issued', 'expired', 'abandoned');
create type public.document_type as enum ('certificate', 'transcript', 'internship_proof', 'project_evidence', 'screenshot', 'report', 'presentation', 'resume_pdf', 'other');

create table public.career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  professional_headline text,
  career_summary text,
  current_stage text,
  target_graduation_date date,
  target_recruitment_cycle text,
  preferred_locations text[] not null default '{}',
  preferred_work_types text[] not null default '{}',
  risk_preferences text,
  constraints_markdown text,
  goals_markdown text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.career_directions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160), description text,
  priority integer not null default 0 check (priority between 0 and 999),
  status public.career_direction_status not null default 'exploring',
  hypothesis_markdown text, supporting_evidence_markdown text, opposing_evidence_markdown text,
  current_decision text, review_date date, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.experiences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_type public.experience_type not null, organization text not null check (char_length(organization) between 1 and 200),
  department text, role text, location text, start_date date, end_date date, is_current boolean not null default false,
  background_markdown text, raw_description_markdown text,
  confidentiality_level public.confidentiality_level not null default 'private',
  status public.career_record_status not null default 'draft', position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check ((not is_current) or end_date is null), check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240), document_type public.document_type not null default 'other',
  original_filename text not null, storage_bucket text not null default 'private-files', storage_path text not null unique,
  mime_type text not null, file_size bigint not null check (file_size > 0 and file_size <= 20971520), checksum text,
  confidentiality_level public.confidentiality_level not null default 'private', uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.experience_facts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade, fact_type public.fact_type not null,
  content text not null check (char_length(content) between 1 and 10000), metric_value numeric, metric_unit text,
  occurred_at date, verification_status public.verification_status not null default 'unverified',
  source_document_id uuid references public.documents(id) on delete set null, notes_markdown text, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.experience_fact_versions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  fact_id uuid not null references public.experience_facts(id) on delete cascade, version_number integer not null check (version_number > 0),
  fact_type public.fact_type not null, content text not null, metric_value numeric, metric_unit text, occurred_at date,
  verification_status public.verification_status not null, source_document_id uuid references public.documents(id) on delete set null,
  notes_markdown text, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (fact_id, version_number)
);

create table public.experience_outputs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240), description_markdown text,
  output_type public.output_type not null default 'other', result_markdown text, public_url text,
  confidentiality_level public.confidentiality_level not null default 'private', occurred_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.experience_bullets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  career_direction_id uuid references public.career_directions(id) on delete set null,
  content text not null check (char_length(content) between 1 and 5000), language text not null default 'zh-CN',
  version_number integer not null default 1 check (version_number > 0), status public.bullet_status not null default 'draft',
  source public.bullet_source not null default 'human', approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check ((status <> 'approved') or approved_at is not null),
  check ((source not in ('ai_draft', 'ai_edited')) or status <> 'approved')
);

create table public.bullet_fact_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  bullet_id uuid not null references public.experience_bullets(id) on delete cascade,
  fact_id uuid not null references public.experience_facts(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (bullet_id, fact_id)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120), category public.skill_category not null default 'other',
  proficiency public.skill_proficiency not null default 'learning', evidence_markdown text, last_used_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);

create table public.experience_skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade, usage_description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (experience_id, skill_id)
);

create table public.certifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200), issuer text, exam_date date, issue_date date, expiry_date date,
  status public.certification_status not null default 'planned', score text, credential_number text,
  document_id uuid references public.documents(id) on delete set null, notes_markdown text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);

-- Core, reusable relationships. Entity types are constrained and services check ownership of both ends.
create table public.entity_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('career_direction', 'experience', 'experience_output', 'note', 'task', 'project', 'document')),
  source_id uuid not null,
  target_type text not null check (target_type in ('career_direction', 'experience', 'experience_output', 'note', 'task', 'project', 'document')),
  target_id uuid not null, relationship_type text not null default 'related' check (char_length(relationship_type) between 1 and 80),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check (not (source_type = target_type and source_id = target_id)), unique (user_id, source_type, source_id, target_type, target_id, relationship_type)
);

create index career_directions_user_status_idx on public.career_directions (user_id, status, priority desc, review_date) where archived_at is null;
create index experiences_user_updated_idx on public.experiences (user_id, updated_at desc) where archived_at is null;
create index experience_facts_experience_idx on public.experience_facts (experience_id, position) where archived_at is null;
create index fact_versions_fact_idx on public.experience_fact_versions (fact_id, version_number desc);
create index outputs_experience_idx on public.experience_outputs (experience_id, occurred_at desc) where archived_at is null;
create index bullets_experience_idx on public.experience_bullets (experience_id, status) where archived_at is null;
create index bullet_fact_links_fact_idx on public.bullet_fact_links (fact_id);
create index skills_user_name_idx on public.skills (user_id, name) where archived_at is null;
create index experience_skills_skill_idx on public.experience_skills (skill_id);
create index certifications_user_status_idx on public.certifications (user_id, status) where archived_at is null;
create index documents_user_uploaded_idx on public.documents (user_id, uploaded_at desc) where archived_at is null;
create index entity_links_source_idx on public.entity_links (user_id, source_type, source_id) where archived_at is null;
create index entity_links_target_idx on public.entity_links (user_id, target_type, target_id) where archived_at is null;

create trigger career_profiles_updated_at before update on public.career_profiles for each row execute procedure public.set_updated_at();
create trigger career_directions_updated_at before update on public.career_directions for each row execute procedure public.set_updated_at();
create trigger experiences_updated_at before update on public.experiences for each row execute procedure public.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute procedure public.set_updated_at();
create trigger experience_facts_updated_at before update on public.experience_facts for each row execute procedure public.set_updated_at();
create trigger experience_outputs_updated_at before update on public.experience_outputs for each row execute procedure public.set_updated_at();
create trigger experience_bullets_updated_at before update on public.experience_bullets for each row execute procedure public.set_updated_at();
create trigger bullet_fact_links_updated_at before update on public.bullet_fact_links for each row execute procedure public.set_updated_at();
create trigger skills_updated_at before update on public.skills for each row execute procedure public.set_updated_at();
create trigger experience_skills_updated_at before update on public.experience_skills for each row execute procedure public.set_updated_at();
create trigger certifications_updated_at before update on public.certifications for each row execute procedure public.set_updated_at();
create trigger entity_links_updated_at before update on public.entity_links for each row execute procedure public.set_updated_at();

-- Snapshot every Fact revision at the database boundary. This is deliberately
-- SECURITY INVOKER; it never bypasses RLS for application requests.
create or replace function public.record_experience_fact_version() returns trigger language plpgsql set search_path = public as $$
declare next_version integer;
begin
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.experience_fact_versions where fact_id = new.id;
  insert into public.experience_fact_versions (
    user_id, fact_id, version_number, fact_type, content, metric_value, metric_unit,
    occurred_at, verification_status, source_document_id, notes_markdown, created_by
  ) values (
    new.user_id, new.id, next_version, new.fact_type, new.content, new.metric_value, new.metric_unit,
    new.occurred_at, new.verification_status, new.source_document_id, new.notes_markdown, new.user_id
  );
  return new;
end;
$$;
create trigger experience_facts_version_snapshot
after insert or update on public.experience_facts
for each row execute procedure public.record_experience_fact_version();

alter table public.career_profiles enable row level security;
alter table public.career_directions enable row level security;
alter table public.experiences enable row level security;
alter table public.documents enable row level security;
alter table public.experience_facts enable row level security;
alter table public.experience_fact_versions enable row level security;
alter table public.experience_outputs enable row level security;
alter table public.experience_bullets enable row level security;
alter table public.bullet_fact_links enable row level security;
alter table public.skills enable row level security;
alter table public.experience_skills enable row level security;
alter table public.certifications enable row level security;
alter table public.entity_links enable row level security;

-- User-owned mutable records. Each operation is explicit; UPDATE uses both USING and WITH CHECK.
create policy "career_profiles_select_own" on public.career_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "career_profiles_insert_own" on public.career_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "career_profiles_update_own" on public.career_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "career_profiles_delete_own" on public.career_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy "career_directions_select_own" on public.career_directions for select to authenticated using ((select auth.uid()) = user_id);
create policy "career_directions_insert_own" on public.career_directions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "career_directions_update_own" on public.career_directions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "career_directions_delete_own" on public.career_directions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "experiences_select_own" on public.experiences for select to authenticated using ((select auth.uid()) = user_id);
create policy "experiences_insert_own" on public.experiences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "experiences_update_own" on public.experiences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "experiences_delete_own" on public.experiences for delete to authenticated using ((select auth.uid()) = user_id);

create policy "documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);

create policy "experience_facts_select_own" on public.experience_facts for select to authenticated using ((select auth.uid()) = user_id);
create policy "experience_facts_insert_own" on public.experience_facts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "experience_facts_update_own" on public.experience_facts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "experience_facts_delete_own" on public.experience_facts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "experience_outputs_select_own" on public.experience_outputs for select to authenticated using ((select auth.uid()) = user_id);
create policy "experience_outputs_insert_own" on public.experience_outputs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "experience_outputs_update_own" on public.experience_outputs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "experience_outputs_delete_own" on public.experience_outputs for delete to authenticated using ((select auth.uid()) = user_id);

create policy "experience_bullets_select_own" on public.experience_bullets for select to authenticated using ((select auth.uid()) = user_id);
create policy "experience_bullets_insert_own" on public.experience_bullets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "experience_bullets_update_own" on public.experience_bullets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "experience_bullets_delete_own" on public.experience_bullets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "bullet_fact_links_select_own" on public.bullet_fact_links for select to authenticated using ((select auth.uid()) = user_id);
create policy "bullet_fact_links_insert_own" on public.bullet_fact_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bullet_fact_links_update_own" on public.bullet_fact_links for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bullet_fact_links_delete_own" on public.bullet_fact_links for delete to authenticated using ((select auth.uid()) = user_id);

create policy "skills_select_own" on public.skills for select to authenticated using ((select auth.uid()) = user_id);
create policy "skills_insert_own" on public.skills for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "skills_update_own" on public.skills for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "skills_delete_own" on public.skills for delete to authenticated using ((select auth.uid()) = user_id);

create policy "experience_skills_select_own" on public.experience_skills for select to authenticated using ((select auth.uid()) = user_id);
create policy "experience_skills_insert_own" on public.experience_skills for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "experience_skills_update_own" on public.experience_skills for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "experience_skills_delete_own" on public.experience_skills for delete to authenticated using ((select auth.uid()) = user_id);

create policy "certifications_select_own" on public.certifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "certifications_insert_own" on public.certifications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "certifications_update_own" on public.certifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "certifications_delete_own" on public.certifications for delete to authenticated using ((select auth.uid()) = user_id);

create policy "entity_links_select_own" on public.entity_links for select to authenticated using ((select auth.uid()) = user_id);
create policy "entity_links_insert_own" on public.entity_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "entity_links_update_own" on public.entity_links for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "entity_links_delete_own" on public.entity_links for delete to authenticated using ((select auth.uid()) = user_id);

-- Fact history is immutable: users can inspect and append snapshots only.
create policy "experience_fact_versions_select_own" on public.experience_fact_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy "experience_fact_versions_insert_own" on public.experience_fact_versions for insert to authenticated with check ((select auth.uid()) = user_id and created_by = (select auth.uid()));
revoke update, delete on public.experience_fact_versions from anon, authenticated;

-- Policies take effect once the user creates the private bucket called private-files.
create policy "private_files_select_own" on storage.objects for select to authenticated using (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "private_files_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "private_files_update_own" on storage.objects for update to authenticated using (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "private_files_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
