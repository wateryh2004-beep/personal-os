"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { projectSchema } from "@/features/projects/schemas";

export async function createProject(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("项目信息不完整，请检查后重试。");
  const { data, error } = await supabase.from("projects").insert({ ...parsed.data, user_id: userId, status: "active" }).select("id").single();
  if (error || !data) throw new Error("项目暂时无法创建，请稍后重试。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "create", entity_type: "project", entity_id: data.id, actor_type: "user", after_data: { name: parsed.data.name } });
  revalidatePath("/projects");
  revalidatePath("/today");
}
