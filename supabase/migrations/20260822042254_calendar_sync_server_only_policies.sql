-- These operational tables are deliberately service-role only. Explicit
-- deny policies document that browser sessions must never read or write the
-- queue, lease, or scheduler telemetry, even if grants change later.
create policy "calendar_sync_queue_server_only" on public.calendar_sync_queue for all to anon, authenticated using (false) with check (false);
create policy "calendar_sync_leases_server_only" on public.calendar_sync_leases for all to anon, authenticated using (false) with check (false);
create policy "calendar_sync_cron_runs_server_only" on public.calendar_sync_cron_runs for all to anon, authenticated using (false) with check (false);
