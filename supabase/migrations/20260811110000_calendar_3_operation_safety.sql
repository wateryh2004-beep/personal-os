alter type public.calendar_operation_status add value if not exists 'remote_committed';
alter type public.calendar_operation_status add value if not exists 'reconciliation_required';

alter table public.calendar_operations
  add column if not exists remote_committed_at timestamptz,
  add column if not exists cache_committed_at timestamptz,
  add column if not exists provider_change_key text;

create index if not exists calendar_operations_reconciliation_idx
  on public.calendar_operations (user_id, status, remote_committed_at desc)
  where archived_at is null;
