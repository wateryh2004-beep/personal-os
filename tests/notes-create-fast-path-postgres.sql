-- Runs only inside the disposable PostgreSQL 17 CI fixture.
-- Entire test is rolled back. Never run against production.
begin;

insert into auth.users (id) values
  ('e1000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000002');

insert into public.note_folders (id, user_id, name) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Notes fast path own folder'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'Notes fast path foreign folder');

do $$
begin
  assert not has_function_privilege('anon', 'public.create_note_fast(uuid)', 'execute'),
    'Anonymous execute privilege leaked';
  assert has_function_privilege('authenticated', 'public.create_note_fast(uuid)', 'execute'),
    'Authenticated execute privilege unavailable';
  assert (
    select p.prosecdef = false
    from pg_proc p
    where p.oid = 'public.create_note_fast(uuid)'::regprocedure
  ), 'Atomic creation must be SECURITY INVOKER';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

create temporary table notes_fast_path_ids (
  id uuid not null primary key,
  folder_id uuid
) on commit drop;

insert into notes_fast_path_ids
select public.create_note_fast(null), null::uuid;

insert into notes_fast_path_ids
select public.create_note_fast('e2000000-0000-4000-8000-000000000001'::uuid),
  'e2000000-0000-4000-8000-000000000001'::uuid;

do $$
declare
  total integer;
begin
  select count(*) into total from notes_fast_path_ids;
  assert total = 2, 'Expected two synthetic notes';
  assert (select count(*) from public.notes where id in (select id from notes_fast_path_ids)) = 2,
    'Atomic notes were not created';
  assert (select count(*) from public.notes n join notes_fast_path_ids ids using (id)
          where n.user_id = auth.uid()
            and n.folder_id is not distinct from ids.folder_id
            and n.body_markdown = ''
            and n.revision = 1
            and n.content_hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') = 2,
    'Canonical note metadata does not match';
  assert (select count(*) from public.note_versions v
          where v.note_id in (select id from notes_fast_path_ids)
            and v.user_id = auth.uid() and v.created_by = auth.uid()
            and v.version_number = 1 and v.revision = 1 and v.reason = 'initial') = 2,
    'Initial immutable snapshots were not created';
  assert (select count(*) from public.audit_logs a
          where a.entity_id in (select id from notes_fast_path_ids)
            and a.user_id = auth.uid() and a.action = 'create' and a.entity_type = 'note') = 2,
    'Create audit trail was not created';

  begin
    perform public.create_note_fast('e2000000-0000-4000-8000-000000000002'::uuid);
    raise exception 'Foreign folder was accepted';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.create_note_fast('e2000000-0000-4000-8000-000000000099'::uuid);
    raise exception 'Missing folder was accepted';
  exception when sqlstate '22023' then
    null;
  end;

  assert (select count(*) from public.notes where user_id = auth.uid()) = 2,
    'Rejected folder created a partial note';
end $$;

-- Force initial-version failure to test the function's transaction boundary.
-- The trigger exists only within this rolled-back synthetic fixture.
set local role postgres;

create function pg_temp.reject_synthetic_initial_version()
returns trigger
language plpgsql
as $trigger$
begin
  raise exception 'notes_fast_path_forced_snapshot_failure'
    using errcode = 'P0001';
end;
$trigger$;

create trigger notes_fast_path_reject_snapshot
before insert on public.note_versions
for each row execute function pg_temp.reject_synthetic_initial_version();

set local role authenticated;

do $$
begin
  begin
    perform public.create_note_fast(null);
    raise exception 'Snapshot failure did not abort atomic create';
  exception when sqlstate 'P0001' then
    null;
  end;

  assert (select count(*) from public.notes where user_id = auth.uid()) = 2,
    'Atomic function left an orphan note after snapshot failure';
  assert (select count(*) from public.note_versions
          where note_id in (select id from notes_fast_path_ids)) = 2,
    'Snapshot count changed after failed transaction';
  assert (select count(*) from public.audit_logs
          where entity_id in (select id from notes_fast_path_ids)) = 2,
    'Audit count changed after failed transaction';
end $$;

set local role postgres;
drop trigger notes_fast_path_reject_snapshot on public.note_versions;

set local role anon;
do $$
begin
  begin
    perform public.create_note_fast(null);
    raise exception 'Anon was allowed to create a note';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
