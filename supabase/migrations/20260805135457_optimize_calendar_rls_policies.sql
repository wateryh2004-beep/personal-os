-- Cache auth.uid() once per statement for the Calendar tables. This follows
-- Supabase's RLS performance guidance without changing the security model.

drop policy "calendar_connections_select_own" on public.calendar_connections;
drop policy "calendar_connections_insert_own" on public.calendar_connections;
drop policy "calendar_connections_update_own" on public.calendar_connections;
drop policy "calendar_connections_delete_own" on public.calendar_connections;
drop policy "calendar_events_select_own" on public.calendar_events;
drop policy "calendar_operations_select_own" on public.calendar_operations;
drop policy "calendar_operations_insert_own" on public.calendar_operations;
drop policy "calendar_operations_update_own" on public.calendar_operations;

create policy "calendar_connections_select_own" on public.calendar_connections for select using (user_id = (select auth.uid()));
create policy "calendar_connections_insert_own" on public.calendar_connections for insert with check (user_id = (select auth.uid()));
create policy "calendar_connections_update_own" on public.calendar_connections for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar_connections_delete_own" on public.calendar_connections for delete using (user_id = (select auth.uid()));

create policy "calendar_events_select_own" on public.calendar_events for select using (user_id = (select auth.uid()));

create policy "calendar_operations_select_own" on public.calendar_operations for select using (user_id = (select auth.uid()));
create policy "calendar_operations_insert_own" on public.calendar_operations for insert with check (user_id = (select auth.uid()));
create policy "calendar_operations_update_own" on public.calendar_operations for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
