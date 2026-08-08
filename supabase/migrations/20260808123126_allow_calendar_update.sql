-- Update joins create/delete in the same owner-confirmed command path. The
-- browser may prepare and confirm its own immutable command; only the
-- server-side executor can claim it or mark it successful.
create or replace function private.enforce_calendar_operation_transition() returns trigger language plpgsql set search_path = public, auth, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending_confirmation' and new.operation_type in ('create', 'update', 'delete') then return new; end if;
    if new.status = 'queued' and new.operation_type = 'sync' then return new; end if;
    raise exception 'calendar operation must be created as a draft or a sync request';
  end if;

  if auth.role() = 'service_role' then return new; end if;

  if old.status = 'pending_confirmation'
    and new.status in ('queued', 'cancelled')
    and new.user_id = old.user_id
    and new.connection_id = old.connection_id
    and new.operation_type = old.operation_type
    and new.provider_event_id is not distinct from old.provider_event_id
    and new.calendar_id is not distinct from old.calendar_id
    and new.payload = old.payload
    and new.result is not distinct from old.result
    and new.error_code is not distinct from old.error_code
  then return new; end if;

  if old.status = 'queued'
    and new.status = 'cancelled'
    and new.user_id = old.user_id
    and new.connection_id = old.connection_id
    and new.operation_type = old.operation_type
    and new.provider_event_id is not distinct from old.provider_event_id
    and new.calendar_id is not distinct from old.calendar_id
    and new.payload = old.payload
    and new.result is not distinct from old.result
    and new.error_code is not distinct from old.error_code
  then return new; end if;

  raise exception 'invalid calendar operation transition';
end;
$$;
