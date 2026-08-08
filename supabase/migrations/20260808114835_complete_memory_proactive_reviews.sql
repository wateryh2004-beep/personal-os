create trigger proactive_events_updated_at before update on public.proactive_events for each row execute procedure public.set_updated_at();
create trigger proactive_insights_updated_at before update on public.proactive_insights for each row execute procedure public.set_updated_at();
alter table public.proactive_events drop constraint if exists proactive_events_event_type_check;
alter table public.proactive_events add constraint proactive_events_event_type_check check(event_type in ('task_overdue','calendar_upcoming','career_milestone_approaching','weekly_review_due','decision_review_due'));

create or replace function public.supersede_personal_memory(
  p_memory_id uuid, p_title text, p_content text, p_ai_visibility text,
  p_valid_until timestamptz default null, p_review_at timestamptz default null
) returns public.personal_memories
language plpgsql security invoker set search_path = public as $$
declare old_row public.personal_memories; result public.personal_memories;
begin
  select * into old_row from public.personal_memories where id=p_memory_id and user_id=(select auth.uid()) and status='active' and archived_at is null for update;
  if old_row.id is null then raise exception 'active memory not found'; end if;
  if old_row.memory_type='working' and p_valid_until is null and p_review_at is null then raise exception 'working memory needs validity'; end if;
  update public.personal_memories set status='superseded' where id=old_row.id;
  insert into public.personal_memories(user_id,memory_type,memory_key,title,content,ai_visibility,valid_until,review_at,supersedes_memory_id,created_via)
    values((select auth.uid()),old_row.memory_type,old_row.memory_key,trim(p_title),trim(p_content),p_ai_visibility,p_valid_until,p_review_at,old_row.id,'manual') returning * into result;
  return result;
end;
$$;
revoke all on function public.supersede_personal_memory(uuid,text,text,text,timestamptz,timestamptz) from public;
grant execute on function public.supersede_personal_memory(uuid,text,text,text,timestamptz,timestamptz) to authenticated;

create or replace function public.reverse_decision(
  p_decision_id uuid, p_title text, p_decision_text text, p_rationale text default '', p_review_at timestamptz default null
) returns public.decisions
language plpgsql security invoker set search_path = public as $$
declare old_row public.decisions; result public.decisions;
begin
  select * into old_row from public.decisions where id=p_decision_id and user_id=(select auth.uid()) and status='active' and archived_at is null for update;
  if old_row.id is null then raise exception 'active decision not found'; end if;
  update public.decisions set status='reversed' where id=old_row.id;
  insert into public.decisions(user_id,title,decision_text,rationale_markdown,context_markdown,status,importance,created_via,ai_visibility,decided_at,review_at,supersedes_decision_id)
    values((select auth.uid()),trim(p_title),trim(p_decision_text),coalesce(p_rationale,''),old_row.context_markdown,'active',old_row.importance,'manual',old_row.ai_visibility,now(),p_review_at,old_row.id) returning * into result;
  return result;
end;
$$;
revoke all on function public.reverse_decision(uuid,text,text,text,timestamptz) from public;
grant execute on function public.reverse_decision(uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.complete_review(
  p_review_type text, p_review_key text, p_title text, p_period_start date, p_period_end date,
  p_content_markdown text, p_structured_data jsonb, p_decision_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_review_id uuid; version_no integer; existing boolean;
begin
  select exists(select 1 from public.reviews where user_id=(select auth.uid()) and review_key=p_review_key) into existing;
  insert into public.reviews(user_id,review_type,review_key,title,period_start,period_end,decision_id,content_markdown,structured_data,status,completed_at)
    values((select auth.uid()),p_review_type,p_review_key,p_title,p_period_start,p_period_end,p_decision_id,p_content_markdown,p_structured_data,'completed',now())
  on conflict(user_id,review_key) do update set title=excluded.title,decision_id=excluded.decision_id,content_markdown=excluded.content_markdown,structured_data=excluded.structured_data,status='completed',completed_at=now()
  returning id into v_review_id;
  select coalesce(max(version_number),0)+1 into version_no from public.review_versions where review_id=v_review_id;
  insert into public.review_versions(user_id,review_id,version_number,content_markdown,structured_data,reason)
    values((select auth.uid()),v_review_id,version_no,p_content_markdown,p_structured_data,case when existing then 'amended' else 'completed' end);
  return v_review_id;
end;
$$;
revoke all on function public.complete_review(text,text,text,date,date,text,jsonb,uuid) from public;
grant execute on function public.complete_review(text,text,text,date,date,text,jsonb,uuid) to authenticated;

create or replace function public.complete_decision_review(
  p_decision_id uuid, p_review_key text, p_title text, p_review_date date, p_content text,
  p_outcome text, p_new_title text default null, p_new_decision_text text default null, p_rationale text default ''
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_review_id uuid;
begin
  if not exists(select 1 from public.decisions where id=p_decision_id and user_id=(select auth.uid()) and status='active' and archived_at is null) then raise exception 'active decision not found'; end if;
  if p_outcome not in ('keep','reverse') then raise exception 'invalid outcome'; end if;
  v_review_id := public.complete_review('decision',p_review_key,p_title,p_review_date,p_review_date,p_content,jsonb_build_object('outcome',p_outcome,'decision_id',p_decision_id),p_decision_id);
  if p_outcome='reverse' then
    if nullif(trim(p_new_title),'') is null or nullif(trim(p_new_decision_text),'') is null then raise exception 'replacement decision required'; end if;
    perform public.reverse_decision(p_decision_id,p_new_title,p_new_decision_text,p_rationale,null);
    update public.decisions set last_reviewed_at=now() where id=p_decision_id;
  else
    update public.decisions set review_at=null,last_reviewed_at=now() where id=p_decision_id;
  end if;
  insert into public.review_sources(user_id,review_id,source_type,source_id,source_role) values((select auth.uid()),v_review_id,'decision',p_decision_id,'origin') on conflict do nothing;
  return v_review_id;
end;
$$;
revoke all on function public.complete_decision_review(uuid,text,text,date,text,text,text,text,text) from public;
grant execute on function public.complete_decision_review(uuid,text,text,date,text,text,text,text,text) to authenticated;
