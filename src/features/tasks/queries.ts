import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";
import type { TodoImportance, TodoList, TodoStatus, TodoTask } from "./types";

type Owner = Awaited<ReturnType<typeof requireOwner>>;

type TodoListRow = {
  id: string;
  display_name: string;
  is_default: boolean;
};

type TodoTaskRow = {
  id: string;
  provider_task_id?: string;
  title: string;
  body_text: string | null;
  status: string;
  due_at: string | null;
  completed_at: string | null;
  todo_list_id: string;
  importance: string | null;
  provider_last_modified_at?: string | null;
};

type TasksWorkspaceReadModel = {
  connection: {
    id: string;
    status: string;
    oauth_connected_at: string | null;
    last_error_code: string | null;
  } | null;
  lists: TodoListRow[];
  tasks: TodoTaskRow[];
};

function isTasksWorkspaceReadModel(value: unknown): value is TasksWorkspaceReadModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TasksWorkspaceReadModel>;
  return Array.isArray(candidate.lists) && Array.isArray(candidate.tasks);
}

function normalizeWorkspace(
  connection: TasksWorkspaceReadModel["connection"] | null | undefined,
  listRows: TodoListRow[],
  taskRows: TodoTaskRow[],
  options: { unavailable?: boolean; schemaMissing?: boolean } = {},
) {
  const normalizedTasks: TodoTask[] = taskRows.map((task) => ({
    id: task.id,
    providerTaskId: task.provider_task_id ?? task.id,
    todoListId: task.todo_list_id,
    title: task.title,
    bodyText: task.body_text,
    status: task.status as TodoStatus,
    importance: (task.importance ?? "normal") as TodoImportance,
    dueAt: task.due_at,
    completedAt: task.completed_at,
    lastModifiedAt: task.provider_last_modified_at ?? null,
  }));
  const normalizedLists: TodoList[] = listRows.map((list) => ({
    id: list.id,
    displayName: list.display_name,
    isDefault: list.is_default,
  }));
  return {
    connection: connection ?? null,
    lists: normalizedLists,
    tasks: normalizedTasks,
    unavailable: options.unavailable ?? false,
    schemaMissing: options.schemaMissing ?? false,
  };
}

async function getMicrosoftTodoWorkspaceLegacy(owner: Owner) {
  const { supabase } = owner;
  const [connection, lists, tasks] = await Promise.all([
    withPerfSpan("tasks.workspace.connection", () => supabase.from("calendar_connections").select("id,status,oauth_connected_at,last_error_code").is("archived_at", null).maybeSingle()),
    withPerfSpan("tasks.workspace.lists", () => supabase.from("microsoft_todo_lists").select("id,display_name,is_default").is("archived_at", null).order("display_name")),
    withPerfSpan("tasks.workspace.tasks", () => supabase.from("microsoft_todo_tasks").select("id,provider_task_id,title,body_text,status,due_at,completed_at,todo_list_id,importance,provider_last_modified_at").is("archived_at", null).order("status").order("due_at", { ascending: true, nullsFirst: false })),
  ]);
  const schemaMissing = [lists.error, tasks.error].some((error) => error && ["42P01", "PGRST205"].includes(error.code));
  return normalizeWorkspace(
    connection.data as TasksWorkspaceReadModel["connection"] | null,
    (lists.data ?? []) as TodoListRow[],
    (tasks.data ?? []) as TodoTaskRow[],
    {
      unavailable: Boolean(connection.error) || (!schemaMissing && Boolean(lists.error || tasks.error)),
      schemaMissing,
    },
  );
}

export async function getMicrosoftTodoWorkspace(owner?: Owner) {
  const resolvedOwner = owner ?? await withPerfSpan("tasks.workspace.auth", () => requireOwner());
  const { supabase } = resolvedOwner;

  // The normal cold-start path is one HTTPS/PostgREST request. Keep the legacy
  // fan-out as a deploy-order and transient-RPC fallback so a read-model schema
  // problem cannot make the Tasks workspace unavailable.
  const compact = await withPerfSpan("tasks.workspace.read-model", () =>
    supabase.rpc("get_tasks_workspace_read_model"),
  );
  if (!compact.error && isTasksWorkspaceReadModel(compact.data)) {
    return normalizeWorkspace(compact.data.connection, compact.data.lists, compact.data.tasks);
  }

  return getMicrosoftTodoWorkspaceLegacy(resolvedOwner);
}
