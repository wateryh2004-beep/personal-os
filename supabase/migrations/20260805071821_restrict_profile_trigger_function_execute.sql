-- This is a trigger-only function. It must not be callable through the public Data API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
