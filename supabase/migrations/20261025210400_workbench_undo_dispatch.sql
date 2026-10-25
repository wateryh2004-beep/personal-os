create function public.undo_workbench_operation(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.workspace_action_receipts;
begin
 if auth.uid() is null then raise exception 'workbench_unauthorized'; end if;
 select * into r from public.workspace_action_receipts where id=p_receipt_id and user_id=auth.uid() for update;
 if not found then raise exception 'workbench_missing'; end if;
 if r.operation in ('note_rename','note_move','note_trash','note_archive','file_rename','file_move','file_archive','graph_link') then return public._undo_core_workbench_operation(r.id); end if;
 if r.operation in ('shopping_quantity','shopping_purchased','travel_stop_metadata','travel_stop_arrival','travel_stop_order','travel_next_stop','travel_document','leisure_progress') then return public._undo_life_field_operation(r.id); end if;
 raise exception 'workbench_undo_not_available';
end $$;
revoke all on function public.undo_workbench_operation(uuid) from public,anon;
grant execute on function public.undo_workbench_operation(uuid) to authenticated;
