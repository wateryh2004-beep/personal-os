-- Run only after real migrations in the isolated PostgreSQL harness. All changes roll back.
begin;
insert into auth.users(id) values ('91000000-0000-4000-8000-000000000001'),('91000000-0000-4000-8000-000000000002') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$
declare
  snap jsonb := '{"version":1,"main":{"href":"/notes?view=recent","position":{"sourceLine":12,"anchor":8,"head":10}},"reference":{"ref":{"kind":"document","id":"92000000-0000-4000-8000-000000000001"},"position":{"pdfPage":4}},"layout":{"referenceFirst":false,"referenceWidth":42,"mobilePane":"main"}}';
  result jsonb; current_revision bigint; identifier uuid := '92000000-0000-4000-8000-000000000002'; request_id uuid := gen_random_uuid(); i integer;
begin
  if not public.valid_workspace_scene_snapshot(snap) then raise exception 'valid synthetic scene rejected'; end if;
  if public.valid_workspace_scene_snapshot(snap || '{"body":"private"}'::jsonb) or public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main}', '{"href":"/notes","position":{"body":"private"}}')) then raise exception 'private payload accepted'; end if;
  if public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main,href}', '"/career/interview?answer=secret"')) or public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main,href}', '"/api/files/id/download"')) then raise exception 'credential/invalid href accepted'; end if;
  if public.valid_workspace_scene_snapshot(jsonb_set(snap,'{reference,position,pdfPage}', '501')) or public.valid_workspace_scene_snapshot(jsonb_set(snap,'{reference,ref,kind}', '"users"')) then raise exception 'bounds/ref invalid accepted'; end if;
  if public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main,href}', to_jsonb('/notes?q=' || repeat('x',33000)))) then raise exception 'oversize accepted'; end if;
  if not public.valid_workbench_href('/shopping?mode=field') or not public.valid_workbench_href('/leisure?kind=book&minutes=60&setting=home&company=solo&budget=free&mode=field') then raise exception 'field filters rejected'; end if;
  if public.valid_workbench_href('/calendar?date=2026-02-30') or public.valid_workbench_href('/files?file=forged') or public.valid_workbench_href('/notes?create=1') then raise exception 'invalid route parameters accepted'; end if;
  if not public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main}', '{"href":"/tasks?view=upcoming","viewState":{"kind":"tasks","view":"upcoming","listId":null},"position":{"scrollOwner":"pane","scrollTop":30}}')) then raise exception 'task view state rejected'; end if;
  if not public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main}', '{"href":"/calendar","viewState":{"kind":"calendar","view":"week","cursor":"2026-10-26","selectedCategories":["Synthetic category"],"hideInternship":true}}')) then raise exception 'calendar view state rejected'; end if;
  if public.valid_workspace_scene_snapshot(jsonb_set(snap,'{main,viewState}', '{"kind":"tasks","view":"all","listId":null}')) then raise exception 'wrong-domain view state accepted'; end if;
  if public.valid_workbench_view_state('{"kind":"calendar","view":null,"cursor":"2026-10-26","selectedCategories":[],"hideInternship":false}') or public.valid_workbench_view_state('{"kind":"calendar","view":"week","cursor":"2026-10-26","selectedCategories":["x","x"],"hideInternship":false}') then raise exception 'malformed calendar view state accepted'; end if;
  if public.valid_workbench_view_state('{"kind":"tasks","view":"all","listId":null,"body":"private"}') then raise exception 'extra private view-state payload accepted'; end if;
  result := public.save_workspace_scene(identifier,request_id,0,'Synthetic scene',snap,false);
  if result->>'status'<>'saved' or (result#>>'{scene,revision}')::bigint<>1 then raise exception 'first save failed'; end if;
  result := public.save_workspace_scene(identifier,request_id,0,'Synthetic scene',snap,false);
  if result->>'status'<>'saved' or (result#>>'{scene,revision}')::bigint<>1 then raise exception 'lost-response retry not idempotent'; end if;
  result := public.save_workspace_scene(identifier,request_id,0,'Different name',snap,false);
  if result->>'status'<>'conflict' then raise exception 'request id payload mismatch accepted'; end if;
  result := public.save_workspace_scene(identifier,gen_random_uuid(),0,'Stale writer',snap,false);
  if result->>'status'<>'conflict' then raise exception 'stale revision accepted'; end if;
  result := public.save_workspace_scene(identifier,gen_random_uuid(),1,'Updated scene',snap,false);
  if result->>'status'<>'saved' or (result#>>'{scene,revision}')::bigint<>2 then raise exception 'CAS update failed'; end if;
  begin
    update public.workspace_scenes set name='bypass CAS' where id=identifier;
    raise exception 'direct write permitted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
  if exists(select 1 from public.workspace_scenes where id=identifier) then raise exception 'other owner can read scene'; end if;
  result := public.save_workspace_scene(identifier,gen_random_uuid(),2,'Other owner',snap,false);
  if result->>'status'<>'missing' then raise exception 'other owner can mutate scene'; end if;
  perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
  result := public.save_workspace_scene(identifier,gen_random_uuid(),2,'Updated scene',snap,true);
  if result->>'status'<>'saved' or result#>>'{scene,archived_at}' is null then raise exception 'archive failed'; end if;
  for i in 1..20 loop
    result := public.save_workspace_scene(('93000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,gen_random_uuid(),0,'Scene '||i,snap,false);
    if result->>'status'<>'saved' then raise exception 'bounded scene create failed'; end if;
  end loop;
  result := public.save_workspace_scene('93000000-0000-4000-8000-000000000021',gen_random_uuid(),0,'Over limit',snap,false);
  if result->>'status'<>'limit' then raise exception '21st active scene accepted'; end if;
  if (select count(*) from public.workspace_scenes where archived_at is null)<>20 then raise exception 'scene limit drift'; end if;
end; $$;
set local role anon;
do $$
begin
  begin
    perform public.save_workspace_scene(gen_random_uuid(),gen_random_uuid(),0,'Anonymous','{}',false);
    raise exception 'anonymous RPC execution allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.workspace_scenes;
    raise exception 'anonymous scene read allowed';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
