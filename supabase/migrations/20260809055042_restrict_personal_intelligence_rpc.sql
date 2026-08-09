revoke all on function public.search_personal_os(text, integer, text[]) from public, anon;
grant execute on function public.search_personal_os(text, integer, text[]) to authenticated;
