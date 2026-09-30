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
    when 'interview_archetype' then 'public.interview_question_archetypes'::regclass
    when 'interview_story' then 'public.interview_stories'::regclass
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
    when 'interview_archetype' then 'public.interview_question_archetypes'::regclass
    when 'interview_story' then 'public.interview_stories'::regclass
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
