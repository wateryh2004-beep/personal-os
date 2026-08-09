-- RLS already limits rows, but the cache should expose no table privileges to
-- anonymous sessions and only SELECT to the authenticated owner session.
revoke all privileges on table public.calendar_categories from anon;
revoke all privileges on table public.calendar_categories from authenticated;
grant select on table public.calendar_categories to authenticated;
