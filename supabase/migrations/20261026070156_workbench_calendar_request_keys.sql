alter table public.calendar_operations add column request_id uuid,add column request_hash text;
create unique index calendar_operation_request_key on public.calendar_operations(user_id,request_id) where request_id is not null;
