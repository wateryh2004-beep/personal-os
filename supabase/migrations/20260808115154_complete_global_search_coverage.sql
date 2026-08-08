create or replace function public.sync_extended_career_search_document() returns trigger
language plpgsql set search_path=public as $$
declare row_data jsonb; entity_type_value text; title_value text; subtitle_value text := ''; content_value text := ''; metadata_value jsonb := '{}'::jsonb; row_id uuid; owner_id uuid; updated_value timestamptz;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := (row_data->>'id')::uuid; owner_id := (row_data->>'user_id')::uuid;
  entity_type_value := case tg_table_name when 'career_profiles' then 'career_profile' when 'experience_facts' then 'experience_fact' when 'experience_outputs' then 'experience_output' when 'experience_bullets' then 'experience_bullet' when 'skills' then 'skill' when 'certifications' then 'certification' when 'career_tracks' then 'career_track' when 'career_milestones' then 'career_milestone' end;
  if tg_op='DELETE' then delete from public.search_documents where user_id=owner_id and entity_type=entity_type_value and entity_id=row_id; return old; end if;
  if nullif(row_data->>'archived_at','') is not null then delete from public.search_documents where user_id=owner_id and entity_type=entity_type_value and entity_id=row_id; return new; end if;
  updated_value := coalesce((row_data->>'updated_at')::timestamptz,now());
  if tg_table_name='career_profiles' then title_value:=coalesce(row_data->>'professional_headline','职业档案'); content_value:=concat_ws(' ',row_data->>'career_summary',row_data->>'current_stage',row_data->>'goals_markdown');
  elsif tg_table_name='experience_facts' then title_value:=left(row_data->>'content',160); subtitle_value:=row_data->>'fact_type'; content_value:=concat_ws(' ',row_data->>'content',row_data->>'notes_markdown',row_data->>'metric_value',row_data->>'metric_unit'); metadata_value:=jsonb_build_object('experience_id',row_data->>'experience_id');
  elsif tg_table_name='experience_outputs' then title_value:=row_data->>'name'; subtitle_value:=row_data->>'output_type'; content_value:=concat_ws(' ',row_data->>'description_markdown',row_data->>'result_markdown'); metadata_value:=jsonb_build_object('experience_id',row_data->>'experience_id');
  elsif tg_table_name='experience_bullets' then title_value:=left(row_data->>'content',160); subtitle_value:=row_data->>'status'; content_value:=row_data->>'content'; metadata_value:=jsonb_build_object('experience_id',row_data->>'experience_id');
  elsif tg_table_name='skills' then title_value:=row_data->>'name'; subtitle_value:=concat_ws(' · ',row_data->>'category',row_data->>'proficiency'); content_value:=row_data->>'evidence_markdown';
  elsif tg_table_name='certifications' then title_value:=row_data->>'name'; subtitle_value:=concat_ws(' · ',row_data->>'issuer',row_data->>'status'); content_value:=row_data->>'notes_markdown';
  elsif tg_table_name='career_tracks' then title_value:=row_data->>'name'; subtitle_value:=row_data->>'status'; content_value:=row_data->>'description';
  else title_value:=row_data->>'title'; subtitle_value:=concat_ws(' · ',row_data->>'status',row_data->>'target_date'); content_value:=row_data->>'description'; metadata_value:=jsonb_build_object('track_id',row_data->>'track_id'); end if;
  insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
  values(owner_id,'career',entity_type_value,row_id,coalesce(title_value,''),coalesce(subtitle_value,''),coalesce(content_value,''),metadata_value,updated_value)
  on conflict(user_id,entity_type,entity_id) do update set title=excluded.title,subtitle=excluded.subtitle,content_text=excluded.content_text,metadata=excluded.metadata,source_updated_at=excluded.source_updated_at,updated_at=now(); return new;
end $$;

create trigger search_career_profiles after insert or update or delete on public.career_profiles for each row execute procedure public.sync_extended_career_search_document();
create trigger search_experience_facts after insert or update or delete on public.experience_facts for each row execute procedure public.sync_extended_career_search_document();
create trigger search_experience_outputs after insert or update or delete on public.experience_outputs for each row execute procedure public.sync_extended_career_search_document();
create trigger search_experience_bullets after insert or update or delete on public.experience_bullets for each row execute procedure public.sync_extended_career_search_document();
create trigger search_skills after insert or update or delete on public.skills for each row execute procedure public.sync_extended_career_search_document();
create trigger search_certifications after insert or update or delete on public.certifications for each row execute procedure public.sync_extended_career_search_document();
create trigger search_career_tracks after insert or update or delete on public.career_tracks for each row execute procedure public.sync_extended_career_search_document();
create trigger search_career_milestones after insert or update or delete on public.career_milestones for each row execute procedure public.sync_extended_career_search_document();

insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','experience_fact',id,left(content,160),fact_type::text,concat_ws(' ',content,notes_markdown,metric_value::text,metric_unit),jsonb_build_object('experience_id',experience_id),updated_at from public.experience_facts where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','experience_output',id,name,output_type::text,concat_ws(' ',description_markdown,result_markdown),jsonb_build_object('experience_id',experience_id),updated_at from public.experience_outputs where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','experience_bullet',id,left(content,160),status::text,content,jsonb_build_object('experience_id',experience_id),updated_at from public.experience_bullets where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at)
select user_id,'career','skill',id,name,concat_ws(' · ',category::text,proficiency::text),coalesce(evidence_markdown,''),updated_at from public.skills where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at)
select user_id,'career','certification',id,name,concat_ws(' · ',issuer,status::text),coalesce(notes_markdown,''),updated_at from public.certifications where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,source_updated_at)
select user_id,'career','career_track',id,name,status,coalesce(description,''),updated_at from public.career_tracks where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
insert into public.search_documents(user_id,domain,entity_type,entity_id,title,subtitle,content_text,metadata,source_updated_at)
select user_id,'career','career_milestone',id,title,concat_ws(' · ',status,target_date::text),coalesce(description,''),jsonb_build_object('track_id',track_id),updated_at from public.career_milestones where archived_at is null
on conflict(user_id,entity_type,entity_id) do nothing;
