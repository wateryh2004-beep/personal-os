-- Disposable full-migration PostgreSQL only; no provider or production access.
begin;
do $$
declare policy_row record; proof_table record; scene_table record;
begin
  select * into policy_row from pg_policy
    where polrelid='public.workspace_scenes'::regclass
      and polname='workspace_scenes_read_owner';
  assert policy_row.polcmd='r' and policy_row.polpermissive;
  assert policy_row.polroles=array['authenticated'::regrole::oid];
  assert policy_row.polwithcheck is null;
  assert pg_get_expr(policy_row.polqual,policy_row.polrelid) like '%SELECT auth.uid()%';
  select * into scene_table from pg_class where oid='public.workspace_scenes'::regclass;
  select * into proof_table from pg_class where oid='public.workspace_original_checks'::regclass;
  assert scene_table.relrowsecurity and scene_table.relforcerowsecurity;
  assert proof_table.relrowsecurity and proof_table.relforcerowsecurity;
  assert not exists(select 1 from pg_policy where polrelid=proof_table.oid);
  assert not has_table_privilege('anon',scene_table.oid,'SELECT');
  assert has_table_privilege('authenticated',scene_table.oid,'SELECT');
  assert not has_table_privilege('authenticated',scene_table.oid,'INSERT,UPDATE,DELETE');
  assert not has_table_privilege('anon',proof_table.oid,'SELECT,INSERT,UPDATE,DELETE');
  assert not has_table_privilege('authenticated',proof_table.oid,'SELECT,INSERT,UPDATE,DELETE');
  assert has_table_privilege('service_role',proof_table.oid,'SELECT,INSERT,UPDATE,DELETE');
end $$;

-- Disabling seq scans here tests index eligibility on tiny synthetic tables,
-- not a latency claim. Each statement models the equality lookup of its FK.
set local enable_seqscan=off;
do $$
declare lookup record; plan jsonb;
begin
  for lookup in select * from (values
    ('proof document cascade',
     'select receipt_id from public.workspace_original_checks where document_id=''a0000000-0000-4000-8000-000000000001''::uuid',
     'workspace_original_checks_document_idx'),
    ('proof owner cascade',
     'select receipt_id from public.workspace_original_checks where user_id=''a0000000-0000-4000-8000-000000000001''::uuid',
     'workspace_original_checks_owner_idx'),
    ('trip document FK',
     'select id from public.trip_documents where trip_id=''a0000000-0000-4000-8000-000000000001''::uuid and user_id=''a0000000-0000-4000-8000-000000000002''::uuid',
     'trip_documents_(owner_idx|trip_id_document_id_key)'),
    ('trip current stop FK',
     'select id from public.trips where current_stop_id=''a0000000-0000-4000-8000-000000000001''::uuid and id=''a0000000-0000-4000-8000-000000000002''::uuid and user_id=''a0000000-0000-4000-8000-000000000003''::uuid',
     'trips_(pkey|id_owner_unique)'),
    ('trip next stop FK',
     'select id from public.trips where next_stop_id=''a0000000-0000-4000-8000-000000000001''::uuid and id=''a0000000-0000-4000-8000-000000000002''::uuid and user_id=''a0000000-0000-4000-8000-000000000003''::uuid',
     'trips_(pkey|id_owner_unique)')
  ) as paths(label,statement,index_pattern) loop
    execute 'explain (format json) ' || lookup.statement into plan;
    if plan::text !~ ('"Index Name": "' || lookup.index_pattern || '"') then
      raise exception 'Missing usable FK index path: %',lookup.label;
    end if;
    assert plan::text like '%Index Cond%';
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
do $$
declare plan jsonb;
begin
  execute 'explain (format json) select id from public.workspace_scenes' into plan;
  assert plan::text like '%InitPlan%';
  -- JWT identity is a statement parameter, rather than a per-row expression.
  assert plan::text like '%user_id = (InitPlan%';
end $$;
rollback;
