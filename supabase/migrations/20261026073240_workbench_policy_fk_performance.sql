-- Cache the request-scoped identity once per statement. The existing SELECT
-- policy, authenticated role, owner predicate and table grants remain intact.
alter policy workspace_scenes_read_owner on public.workspace_scenes
  using (user_id = (select auth.uid()));

-- The receipt-leading PK cannot support document/user cascades by itself.
-- Keep these service-only proof lookups bounded without adding read policies.
create index workspace_original_checks_document_idx
  on public.workspace_original_checks(document_id);
create index workspace_original_checks_owner_idx
  on public.workspace_original_checks(user_id);

-- Other new FK checks already have usable paths: trip_documents has both
-- (user_id,trip_id) and trip_id-leading uniqueness; trips.id uniquely identifies
-- the candidate for its (current_stop_id|next_stop_id,id,user_id) checks.
