import { requireOwner } from "@/lib/auth/require-owner";

export async function getProjects() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id,name,description,status,due_date,updated_at,blocker_text,next_todo_task_id,mutation_revision",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { projects: [], unavailable: true };
  const tasks = await supabase
    .from("microsoft_todo_tasks")
    .select("id,title,status,archived_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(501);
  const materials = await supabase
    .from("notes")
    .select("id,title,project_id")
    .eq("user_id", userId)
    .is("vault_group_id", null)
    .is("archived_at", null)
    .is("deleted_at", null)
    .not("project_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(501);
  return {
    materials: materials.data?.slice(0, 500) ?? [],
    materialsUnavailable: Boolean(materials.error),
    materialsTruncated: (materials.data?.length ?? 0) > 500,
    projects: data ?? [],
    unavailable: false,
    todoTasks: tasks.data?.slice(0, 500) ?? [],
    tasksUnavailable: Boolean(tasks.error),
    tasksTruncated: (tasks.data?.length ?? 0) > 500,
  };
}
