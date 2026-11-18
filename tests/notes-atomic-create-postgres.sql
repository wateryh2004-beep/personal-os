-- Disposable PostgreSQL 17 regression fixture only.
-- Exercises the real migration with authenticated JWT owners and RLS; do not
-- run against production or a database holding user documents.
insert into auth.users(id) values
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002');

insert into public.note_folders(id,user_id,name)
values(
  'c2000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002',
  'Other owner synthetic folder'
);

do $$
begin
  assert (
    select not p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_empty_note_atomic'
  ), 'RLS invoker is mandatory';
  assert not has_function_privilege('anon','public.create_empty_note_atomic(uuid,uuid)','EXECUTE'), 'anon cannot invoke create';
  assert has_function_privilege('authenticated','public.create_empty_note_atomic(uuid,uuid)','EXECUTE'), 'authenticated can invoke create';
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$
declare
  created_id uuid := 'c3000000-0000-4000-8000-000000000001';
begin
  assert public.create_empty_note_atomic(created_id, null) = created_id;
  assert public.create_empty_note_atomic(created_id, null) = created_id,
    'same UUID must return one note after an uncertain retry';
  assert (
    select count(*) = 1 and min(revision)=1 and min(body_markdown)=''
    from public.notes where id=created_id
  ), 'exactly one clean canonical note';
  assert (
    select count(*)=1 and min(version_number)=1 and min(reason)='initial'
    from public.note_versions where note_id=created_id
  ), 'exactly one initial revision';
  assert (
    select count(*)=1 and bool_and(request_id=created_id)
    from public.audit_logs where action='create' and entity_type='note' and entity_id=created_id
  ), 'exactly one owner-linked create audit';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.create_empty_note_atomic(
      'c3000000-0000-4000-8000-000000000002',
      'c2000000-0000-4000-8000-000000000001'
    );
  exception when sqlstate '22023' then
    rejected := true;
  end;
  assert rejected, 'foreign folder must be rejected';
  assert not exists(select 1 from public.notes where id='c3000000-0000-4000-8000-000000000002'),
    'invalid folder must not leave orphan records';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.create_empty_note_atomic('c3000000-0000-4000-8000-000000000001',null);
  exception when sqlstate '23505' then
    rejected := true;
  end;
  assert rejected, 'other owners cannot claim a preexisting note UUID';
  assert not exists(
    select 1 from public.notes
    where id='c3000000-0000-4000-8000-000000000001'
  ), 'other owner cannot read the first owners note through RLS';
end $$;
commit;

-- Failure injection: both immutable snapshot and audit must be mandatory.
-- This temporary trigger exercise runs against the disposable CI database,
-- without mutating or deleting any production record.
begin;
create function pg_temp.reject_atomic_snapshot_for_ci()
returns trigger language plpgsql as $note_ci_trigger$
begin
  raise exception 'synthetic_snapshot_rejected' using errcode='P0001';
end;
$note_ci_trigger$;
create trigger notes_atomic_snapshot_failure_ci
before insert on public.note_versions
for each row execute function pg_temp.reject_atomic_snapshot_for_ci();
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $note_atomic_ci$
declare
  rejected boolean := false;
begin
  begin
    perform public.create_empty_note_atomic('c3000000-0000-4000-8000-000000000011',null);
  exception when sqlstate 'P0001' then
    rejected := true;
  end;
  assert rejected, 'snapshot trigger failure must propagate';
  assert not exists(select 1 from public.notes where id='c3000000-0000-4000-8000-000000000011'),
    'snapshot failure cannot leave an orphan note';
  assert not exists(select 1 from public.audit_logs where entity_id='c3000000-0000-4000-8000-000000000011'),
    'snapshot failure cannot create a misleading audit';
end $note_atomic_ci$;
rollback;

begin;
create function pg_temp.reject_atomic_audit_for_ci()
returns trigger language plpgsql as $note_ci_trigger$
begin
  if new.action = 'create' and new.entity_type = 'note' then
    raise exception 'synthetic_audit_rejected' using errcode='P0001';
  end if;
  return new;
end;
$note_ci_trigger$;
create trigger notes_atomic_audit_failure_ci
before insert on public.audit_logs
for each row execute function pg_temp.reject_atomic_audit_for_ci();
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $note_atomic_ci$
declare
  rejected boolean := false;
begin
  begin
    perform public.create_empty_note_atomic('c3000000-0000-4000-8000-000000000012',null);
  exception when sqlstate 'P0001' then
    rejected := true;
  end;
  assert rejected, 'audit trigger failure must propagate';
  assert not exists(select 1 from public.notes where id='c3000000-0000-4000-8000-000000000012'),
    'audit failure cannot leave an orphan note';
  assert not exists(select 1 from public.note_versions where note_id='c3000000-0000-4000-8000-000000000012'),
    'audit failure cannot leave an orphan version';
end $note_atomic_ci$;
rollback;
