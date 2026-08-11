-- `auth.uid()` is stable within one statement, but calling it directly in an
-- RLS expression can make Postgres re-evaluate it for every scanned row. The
-- subquery is semantically identical and lets Postgres use an InitPlan.

alter policy "profiles_select_own" on public.profiles using (user_id = (select auth.uid()));
alter policy "profiles_insert_own" on public.profiles with check (user_id = (select auth.uid()));
alter policy "profiles_update_own" on public.profiles using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "profiles_delete_own" on public.profiles using (user_id = (select auth.uid()));

alter policy "areas_select_own" on public.areas using (user_id = (select auth.uid()));
alter policy "areas_insert_own" on public.areas with check (user_id = (select auth.uid()));
alter policy "areas_update_own" on public.areas using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "areas_delete_own" on public.areas using (user_id = (select auth.uid()));

alter policy "projects_select_own" on public.projects using (user_id = (select auth.uid()));
alter policy "projects_insert_own" on public.projects with check (user_id = (select auth.uid()));
alter policy "projects_update_own" on public.projects using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "projects_delete_own" on public.projects using (user_id = (select auth.uid()));

alter policy "tasks_select_own" on public.tasks using (user_id = (select auth.uid()));
alter policy "tasks_insert_own" on public.tasks with check (user_id = (select auth.uid()));
alter policy "tasks_update_own" on public.tasks using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "tasks_delete_own" on public.tasks using (user_id = (select auth.uid()));

alter policy "inbox_select_own" on public.inbox_items using (user_id = (select auth.uid()));
alter policy "inbox_insert_own" on public.inbox_items with check (user_id = (select auth.uid()));
alter policy "inbox_update_own" on public.inbox_items using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "inbox_delete_own" on public.inbox_items using (user_id = (select auth.uid()));

alter policy "activity_select_own" on public.activity_events using (user_id = (select auth.uid()));
alter policy "activity_insert_own" on public.activity_events with check (user_id = (select auth.uid()));
alter policy "activity_update_own" on public.activity_events using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "activity_delete_own" on public.activity_events using (user_id = (select auth.uid()));

alter policy "notes_select_own" on public.notes using (user_id = (select auth.uid()));
alter policy "notes_insert_own" on public.notes with check (user_id = (select auth.uid()));
alter policy "notes_update_own" on public.notes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "notes_delete_own" on public.notes using (user_id = (select auth.uid()));

alter policy "audit_select_own" on public.audit_logs using (user_id = (select auth.uid()));
alter policy "audit_insert_own" on public.audit_logs with check (user_id = (select auth.uid()));

alter policy "note_versions_select_own" on public.note_versions using (user_id = (select auth.uid()));
alter policy "note_versions_insert_own" on public.note_versions with check (user_id = (select auth.uid()) and created_by = (select auth.uid()));
