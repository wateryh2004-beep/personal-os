-- PREPARED ROLLBACK ONLY. Requires explicit approval for the target database.
-- Removes this authoring entry point and its receipt uniqueness index only.
-- Preserves every note, version, interview answer, audit receipt and provenance.
-- Do not use CASCADE: unexpected dependencies must block rollback for review.
begin;
revoke all on function public.write_content(jsonb) from public, anon, authenticated, service_role;
drop function public.write_content(jsonb);
drop index public.content_write_receipt_unique_idx;
commit;
