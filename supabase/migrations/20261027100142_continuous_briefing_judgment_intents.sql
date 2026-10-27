-- Explicit manual judgments and their immutable source/intent history.
alter table public.briefing_entries add constraint briefing_entries_judgment_owner_unique unique(user_id,id);
-- decisions already has unique(user_id,id) from personal_memory_v1.
create table public.briefing_judgment_versions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_id uuid not null,
 decision_id uuid not null,
 judgment text not null check(private.inbox_ai_utf16_length(judgment) between 1 and 5000),
 confidence integer not null check(confidence between 0 and 100),
 falsification text check(falsification is null or private.inbox_ai_utf16_length(falsification)<=2000),
 review_period text not null check(review_period in('1_month','3_months','6_months','1_year')),
 expected_decision_id uuid,
 expected_updated_at timestamptz,
 decision_updated_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,entry_id) references public.briefing_entries(user_id,id),
 foreign key(user_id,decision_id) references public.decisions(user_id,id),
 check((expected_decision_id is null)=(expected_updated_at is null))
);
create index briefing_judgment_versions_entry on public.briefing_judgment_versions(user_id,entry_id,created_at desc);
create index briefing_judgment_versions_decision on public.briefing_judgment_versions(user_id,decision_id);
alter table public.briefing_judgment_versions enable row level security;
alter table public.briefing_judgment_versions force row level security;
create policy briefing_judgment_versions_owner_read on public.briefing_judgment_versions for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.briefing_judgment_versions from public,anon,authenticated,service_role;
grant select on public.briefing_judgment_versions to authenticated;


create function workflow_private.guard_briefing_judgment_version() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'briefing_judgment_version_immutable' using errcode='23514';end $$;
revoke all on function workflow_private.guard_briefing_judgment_version() from public,anon,authenticated,service_role;
create trigger briefing_judgment_versions_immutable before update or delete on public.briefing_judgment_versions for each row execute function workflow_private.guard_briefing_judgment_version();

create function public.save_briefing_judgment_intent(
 p_intent_id uuid,p_entry_id uuid,p_expected_decision_id uuid,p_expected_updated_at timestamptz,
 p_judgment text,p_confidence integer,p_falsification text,p_review_period text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); entry public.briefing_entries%rowtype; previous public.briefing_judgment_versions%rowtype;
 decision public.decisions%rowtype; matches integer; linked uuid; item public.feed_items%rowtype; briefing_date date;
 saved_at timestamptz; due_at timestamptz; tz text; months integer;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_intent_id is null or p_entry_id is null or p_judgment is null or private.inbox_ai_utf16_length(btrim(p_judgment)) not between 1 and 5000
  or p_confidence is null or p_confidence not between 0 and 100 or coalesce(private.inbox_ai_utf16_length(p_falsification),0)>2000
  or p_review_period is null or p_review_period not in('1_month','3_months','6_months','1_year')
  or ((p_expected_decision_id is null)<>(p_expected_updated_at is null)) then raise exception 'judgment_invalid' using errcode='22023';end if;
 -- Lock the domain source before looking up/creating its single judgment relation.
 select * into entry from public.briefing_entries where id=p_entry_id and user_id=owner for update;
 if not found then raise exception 'briefing_entry_unavailable' using errcode='42501';end if;
 select * into previous from public.briefing_judgment_versions where id=p_intent_id;
 if found then
  if previous.user_id<>owner or previous.entry_id<>p_entry_id or
   row(previous.judgment,previous.confidence,previous.falsification,previous.review_period,previous.expected_decision_id,previous.expected_updated_at)
    is distinct from row(p_judgment,p_confidence,p_falsification,p_review_period,p_expected_decision_id,p_expected_updated_at)
   then raise exception 'judgment_intent_conflict' using errcode='40001';end if;
  select * into decision from public.decisions where id=previous.decision_id and user_id=owner;
  if not found then raise exception 'judgment_unavailable' using errcode='42501';end if;
  return jsonb_build_object('decision_id',previous.decision_id,'updated_at',previous.decision_updated_at,'superseded',decision.updated_at is distinct from previous.decision_updated_at);
 end if;
 select count(*),min(ds.decision_id::text)::uuid into matches,linked from public.decision_sources ds
  where ds.user_id=owner and ds.source_type='briefing_entry' and ds.source_id=p_entry_id and ds.source_role='origin';
 if matches>1 then raise exception 'judgment_multiple_sources' using errcode='40001';end if;
 if linked is distinct from p_expected_decision_id then raise exception 'judgment_revision_conflict' using errcode='40001';end if;
 select * into item from public.feed_items where id=entry.representative_item_id and user_id=owner and archived_at is null;
 if not found then raise exception 'briefing_source_unavailable' using errcode='42501';end if;
 select b.briefing_date into briefing_date from public.briefings b where b.id=entry.briefing_id and b.user_id=owner;
 if not found then raise exception 'briefing_source_unavailable' using errcode='42501';end if;
 select coalesce(p.timezone,'Asia/Shanghai') into tz from public.profiles p where p.user_id=owner;
 tz:=coalesce(tz,'Asia/Shanghai');
 months:=case p_review_period when '1_month' then 1 when '3_months' then 3 when '6_months' then 6 else 12 end;
 due_at:=((now() at time zone tz)+make_interval(months=>months)) at time zone tz;
 if linked is not null then
  select * into decision from public.decisions where id=linked and user_id=owner and archived_at is null for update;
  if not found or decision.updated_at is distinct from p_expected_updated_at then raise exception 'judgment_revision_conflict' using errcode='40001';end if;
  update public.decisions set decision_text=p_judgment,confidence=p_confidence,falsification_condition=p_falsification,
   rationale_markdown=case when p_falsification is null then '' else '**什么会证明我错了**'||E'\n\n'||p_falsification end,review_at=due_at
   where id=linked and user_id=owner returning updated_at into saved_at;
 else
  insert into public.decisions(user_id,title,decision_text,rationale_markdown,context_markdown,status,importance,created_via,ai_visibility,review_at,confidence,falsification_condition)
   values(owner,left('关于「'||item.title||'」的判断',200),p_judgment,case when p_falsification is null then '' else '**什么会证明我错了**'||E'\n\n'||p_falsification end,
    '来自 Briefing '||briefing_date::text,'active','normal','manual','normal',due_at,p_confidence,p_falsification)
   returning id,updated_at into linked,saved_at;
  insert into public.decision_sources(user_id,decision_id,source_type,source_id,source_role)
   values(owner,linked,'briefing_entry',p_entry_id,'origin'),(owner,linked,'feed_item',item.id,'context');
 end if;
 insert into public.briefing_judgment_versions(id,user_id,entry_id,decision_id,judgment,confidence,falsification,review_period,expected_decision_id,expected_updated_at,decision_updated_at)
  values(p_intent_id,owner,p_entry_id,linked,p_judgment,p_confidence,p_falsification,p_review_period,p_expected_decision_id,p_expected_updated_at,saved_at);
 insert into public.audit_logs(user_id,action,entity_type,entity_id,actor_type,after_data)
  values(owner,'briefing_judgment_saved','decision',linked,'user',jsonb_build_object('entry_id',p_entry_id,'version_id',p_intent_id,'character_count',private.inbox_ai_utf16_length(p_judgment)));
 return jsonb_build_object('decision_id',linked,'updated_at',saved_at,'superseded',false);
end $$;
revoke all on function public.save_briefing_judgment_intent(uuid,uuid,uuid,timestamptz,text,integer,text,text) from public,anon,service_role;
grant execute on function public.save_briefing_judgment_intent(uuid,uuid,uuid,timestamptz,text,integer,text,text) to authenticated;

create function public.read_briefing_judgment_intent(
 p_intent_id uuid,p_entry_id uuid,p_expected_decision_id uuid,p_expected_updated_at timestamptz,
 p_judgment text,p_confidence integer,p_falsification text,p_review_period text
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare previous public.briefing_judgment_versions%rowtype; updated timestamptz;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select * into previous from public.briefing_judgment_versions where id=p_intent_id and user_id=auth.uid();
 if not found then return null;end if;
 if previous.entry_id<>p_entry_id or row(previous.judgment,previous.confidence,previous.falsification,previous.review_period,previous.expected_decision_id,previous.expected_updated_at)
  is distinct from row(p_judgment,p_confidence,p_falsification,p_review_period,p_expected_decision_id,p_expected_updated_at)
  then raise exception 'judgment_intent_conflict' using errcode='40001';end if;
 select d.updated_at into updated from public.decisions d where d.id=previous.decision_id and d.user_id=auth.uid() and d.archived_at is null;
 if not found then return null;end if;
 return jsonb_build_object('decision_id',previous.decision_id,'updated_at',previous.decision_updated_at,'superseded',updated is distinct from previous.decision_updated_at);
end $$;
revoke all on function public.read_briefing_judgment_intent(uuid,uuid,uuid,timestamptz,text,integer,text,text) from public,anon,service_role;
grant execute on function public.read_briefing_judgment_intent(uuid,uuid,uuid,timestamptz,text,integer,text,text) to authenticated;
