import { requireOwner } from "@/lib/auth/require-owner";
import type { TodoImportance, TodoList, TodoStatus, TodoTask } from "./types";

export async function getMicrosoftTodoWorkspace() {
  const { supabase } = await requireOwner();
  const [connection, lists, tasks] = await Promise.all([
    supabase.from("calendar_connections").select("id,status,oauth_connected_at,last_error_code").is("archived_at", null).maybeSingle(),
    supabase.from("microsoft_todo_lists").select("id,display_name,is_default").is("archived_at", null).order("display_name"),
    supabase.from("microsoft_todo_tasks").select("id,provider_task_id,title,body_text,status,due_at,completed_at,todo_list_id,importance,provider_last_modified_at").is("archived_at", null).order("status").order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  const schemaMissing = [lists.error, tasks.error].some((error) => error && ["42P01", "PGRST205"].includes(error.code));
  const taskRows = tasks.data ?? [];
  const listRows = lists.data ?? [];
  const normalizedTasks: TodoTask[] = taskRows.map((task) => ({
    id: task.id, providerTaskId: (task as { provider_task_id?: string }).provider_task_id ?? task.id,
    todoListId: task.todo_list_id, title: task.title, bodyText: task.body_text,
    status: task.status as TodoStatus, importance: (task.importance ?? "normal") as TodoImportance,
    dueAt: task.due_at, completedAt: task.completed_at,
    lastModifiedAt: (task as { provider_last_modified_at?: string | null }).provider_last_modified_at ?? null,
  }));
  const normalizedLists: TodoList[] = listRows.map((list) => ({ id: list.id, displayName: list.display_name, isDefault: list.is_default }));
  return { connection: connection.data, lists: normalizedLists, tasks: normalizedTasks, unavailable: Boolean(connection.error) || (!schemaMissing && Boolean(lists.error || tasks.error)), schemaMissing };
}
