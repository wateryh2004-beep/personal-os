import { requireOwner } from "@/lib/auth/require-owner";
import { splitTodayTasks, type TodayTask } from "@/features/today/utils";

type QueryError = { code?: string } | null;

function isMissingTable(error: QueryError) {
  return Boolean(error?.code && ["42P01", "PGRST205"].includes(error.code));
}

export async function getTodayWorkspace(now = new Date()) {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";

  const [tasksResult, notesResult, projectsResult, inboxResult] = await Promise.all([
    supabase
      .from("microsoft_todo_tasks")
      .select("id,title,due_at,importance,status")
      .is("archived_at", null)
      .neq("status", "completed")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from("notes")
      .select("id,title,updated_at,pinned_at")
      .is("deleted_at", null)
      .neq("status", "archived")
      .neq("status", "trashed")
      .order("pinned_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("projects")
      .select("id,name,status,due_date,updated_at")
      .is("archived_at", null)
      .eq("status", "active")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);

  const tasks = tasksResult.error ? [] : (tasksResult.data ?? []) as TodayTask[];
  const notes = notesResult.error ? [] : notesResult.data ?? [];
  const projects = projectsResult.error ? [] : projectsResult.data ?? [];
  const inboxCount = inboxResult.error ? 0 : inboxResult.count ?? 0;

  return {
    timezone,
    tasks: splitTodayTasks(tasks, now, timezone),
    notes,
    projects,
    inboxCount,
    todoAvailable: !isMissingTable(tasksResult.error) && !tasksResult.error,
  };
}
