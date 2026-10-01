-- Run against the isolated validation database with its two existing test owners.
-- Everything, including fixtures and audit rows, is rolled back.
begin;
insert into public.calendar_connections (id,user_id) values
('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
('a2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
insert into public.microsoft_todo_lists (id,user_id,connection_id,provider_list_id,display_name) values
('b1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','focus-test-owner','Focus test'),
('b2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','focus-test-other','Focus test');
insert into public.microsoft_todo_tasks (id,user_id,todo_list_id,provider_task_id,title)
select ('c0000000-0000-4000-8000-00000000000' || n)::uuid, '11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'focus-test-' || n, 'Focus fixture ' || n from generate_series(1,4) n;
insert into public.microsoft_todo_tasks (id,user_id,todo_list_id,provider_task_id,title) values
('d0000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','focus-other','Other owner');
do $$ begin
  assert not has_table_privilege('anon','public.today_task_priorities','select');
  assert not has_function_privilege('anon','public.set_today_task_priorities(date,uuid[],uuid[])','execute');
  assert not has_table_privilege('authenticated','public.today_task_priorities','delete');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
  today date := (now() at time zone coalesce((select timezone from public.profiles where user_id=auth.uid()),'Asia/Shanghai'))::date;
  ids uuid[] := array['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003']::uuid[];
  denied boolean;
begin
  perform public.set_today_task_priorities(today,ids,'{}');
  assert (select count(*)=3 from public.today_task_priorities where archived_at is null), 'three priorities saved';
  assert (select bool_and(due_at is null and status='notStarted') from public.microsoft_todo_tasks), 'provider tasks unchanged';
  denied := false;
  begin perform public.set_today_task_priorities(today,ids,'{}'); exception when others then denied := sqlerrm = 'focus_conflict'; end;
  assert denied, 'stale window rejected';
  denied := false;
  begin perform public.set_today_task_priorities(today,ids || 'c0000000-0000-4000-8000-000000000004'::uuid,ids); exception when others then denied := sqlerrm = 'focus_invalid'; end;
  assert denied, 'four priorities rejected';
  denied := false;
  begin perform public.set_today_task_priorities(today,array[ids[1],ids[1]],ids); exception when others then denied := sqlerrm = 'focus_invalid'; end;
  assert denied, 'duplicates rejected';
  denied := false;
  begin perform public.set_today_task_priorities(today,array['d0000000-0000-4000-8000-000000000001']::uuid[],ids); exception when others then denied := sqlerrm = 'focus_task_unavailable'; end;
  assert denied, 'cross-owner reference rejected';
  denied := false;
  begin perform public.set_today_task_priorities(today-1,ids,'{}'); exception when others then denied := sqlerrm = 'focus_date_changed'; end;
  assert denied, 'stale date rejected';
  denied := false;
  begin insert into public.today_task_priorities(user_id,focus_date,task_id,position) values(auth.uid(),today+1,'d0000000-0000-4000-8000-000000000001',1); exception when insufficient_privilege then denied := true; end;
  assert denied, 'direct cross-owner reference rejected by RLS';
  perform public.set_today_task_priorities(today,array[ids[3],ids[1]],ids);
  assert (select array_agg(task_id order by position)=array[ids[3],ids[1]] from public.today_task_priorities where archived_at is null), 'reorder works';
  assert (select count(*)=1 from public.today_task_priorities where archived_at is not null), 'removed selection archived';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  assert (select count(*)=0 from public.today_task_priorities), 'other owner cannot read';
  update public.today_task_priorities set position=3 where user_id='11111111-1111-4111-8111-111111111111';
  assert not found, 'other owner cannot update';
end $$;
reset role;
select 'PASS: owner isolation, direct RLS, anonymous denial, 3-item cap, undated tasks, stale date/window, archive/reorder, unchanged tasks' as verification;
rollback;
