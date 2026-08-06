import { requireOwner } from "@/lib/auth/require-owner";

export async function getMicrosoftTodoWorkspace() {
  const { supabase } = await requireOwner();
  const [connection, lists, tasks] = await Promise.all([
    supabase.from("calendar_connections").select("id,status,oauth_connected_at,last_error_code").is("archived_at", null).maybeSingle(),
    supabase.from("microsoft_todo_lists").select("id,display_name,is_default").is("archived_at", null).order("display_name"),
    supabase.from("microsoft_todo_tasks").select("id,title,body_text,status,due_at,completed_at,todo_list_id,importance").is("archived_at", null).order("status").order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  const schemaMissing = [lists.error, tasks.error].some((error) => error && ["42P01", "PGRST205"].includes(error.code));
  return { connection: connection.data, lists: lists.data ?? [], tasks: tasks.data ?? [], unavailable: Boolean(connection.error) || (!schemaMissing && Boolean(lists.error || tasks.error)), schemaMissing };
}
