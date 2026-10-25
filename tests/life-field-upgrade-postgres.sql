-- After pre-workbench-legacy-fixture.sql and all six workbench migrations.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare r jsonb; begin
 assert (select quantity is null and quantity_unit is null and mutation_revision=1 from public.purchase_items where id='82000000-0000-4000-8000-000000000001');
 assert (select current_stop_id is null and next_stop_id is null from public.trips where id='83000000-0000-4000-8000-000000000001');
 assert (select arrived_at is null and notes='Legacy travel note' and planned_time='10:30'::time from public.trip_stops where id='84000000-0000-4000-8000-000000000001');
 assert (select progress_unit is null and progress_value is null and personal_note='Legacy personal note' and status='current' and revision=1 from public.leisure_feedback where experience_id='86000000-0000-4000-8000-000000000001');
 r:=public.apply_life_field_operation(gen_random_uuid(),'leisure_progress','[{"id":"86000000-0000-4000-8000-000000000001","expected_revision":1,"progress_unit":"episode","progress_value":2,"progress_total":8}]');
 perform public.save_leisure_feedback('86000000-0000-4000-8000-000000000001',2,'current','liked','Legacy client edit',null);
 assert (select progress_value=2 and personal_note='Legacy client edit' and revision=3 from public.leisure_feedback where experience_id='86000000-0000-4000-8000-000000000001');
 begin perform public.undo_workbench_operation((r->>'receiptId')::uuid);raise exception 'legacy write must invalidate undo';exception when serialization_failure then null;end;
end $$;
rollback;
