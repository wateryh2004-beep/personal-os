-- A search hit is never proof of an original until the upload is committed.
-- Keep this final guard independent of text/OCR-specific index producers.
create function public.enforce_file_search_availability() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare source public.documents;
begin
  source := case when tg_op='DELETE' then old else new end;
  if tg_op='DELETE' or source.storage_state is distinct from 'available' or source.archived_at is not null then
    delete from public.search_documents where user_id=source.user_id and entity_type='document' and entity_id=source.id;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
-- PostgreSQL orders same-event triggers by name. Run after existing index syncs.
create trigger zz_files_search_availability after insert or update or delete on public.documents
for each row execute function public.enforce_file_search_availability();
revoke all on function public.enforce_file_search_availability() from public,anon,authenticated;
-- Remove only rebuildable unavailable-file index rows, never documents or bytes.
delete from public.search_documents s using public.documents d
where s.entity_type='document' and s.entity_id=d.id and s.user_id=d.user_id
  and (d.storage_state is distinct from 'available' or d.archived_at is not null);
