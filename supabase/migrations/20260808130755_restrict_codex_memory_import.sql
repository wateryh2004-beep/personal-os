revoke all on function public.import_personal_memory_batch(
  text,
  text,
  timestamptz,
  text,
  jsonb
) from public, anon;

grant execute on function public.import_personal_memory_batch(
  text,
  text,
  timestamptz,
  text,
  jsonb
) to authenticated;
