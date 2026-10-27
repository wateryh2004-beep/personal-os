"use server";

import { revalidatePath } from "@/lib/workspace-revalidation";
import { requireOwner } from "@/lib/auth/require-owner";
import { projectSchema } from "@/features/projects/schemas";

export async function createProject(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("项目信息不完整，请检查后重试。");
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, user_id: userId, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error("项目暂时无法创建，请稍后重试。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "create",
    entity_type: "project",
    entity_id: data.id,
    actor_type: "user",
    after_data: { name: parsed.data.name },
  });
  await revalidatePath("/projects");
  await revalidatePath("/today");
}

export async function saveProjectWorkflow(input: unknown) {
  const { z } = await import("zod");
  const value = z
    .object({
      id: z.string().uuid(),
      revision: z.number().int().min(1),
      goal: z.string().max(8000),
      blocker: z.string().max(8000),
      nextTask: z.string().uuid().nullable(),
    })
    .strict()
    .parse(input);
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_project_workflow", {
    p_project_id: value.id,
    p_expected_revision: value.revision,
    p_goal: value.goal,
    p_blocker: value.blocker,
    p_next_task: value.nextTask,
  });
  if (error || !data)
    throw new Error(
      "项目未能保存，可能已被其他页面修改或任务不可用。输入已保留，请重新核对。",
    );
  return data;
}

export async function readProjectWorkflow(id: string) {
  const { z } = await import("zod");
  const projectId = z.string().uuid().parse(id);
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id,name,description,status,due_date,updated_at,blocker_text,next_todo_task_id,mutation_revision",
    )
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("项目最新内容暂时不可用，当前输入保留。");
  return data;
}
