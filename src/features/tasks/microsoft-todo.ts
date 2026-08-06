"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { completeMicrosoftTodoTask, syncMicrosoftTodo } from "@/lib/adapters/microsoft-graph/calendar";
import { requireOwner } from "@/lib/auth/require-owner";

function fail(): never { throw new Error("Microsoft To Do 操作未能完成，请重新连接后重试。"); }

async function activeConnection(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const { data, error } = await supabase.from("calendar_connections").select("id,status").is("archived_at", null).maybeSingle();
  if (error || !data || data.status !== "enabled") fail();
  return data;
}

async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityId: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "microsoft_todo", entity_id: entityId, actor_type: "user", after_data: data });
  if (error) fail();
}

export async function syncMicrosoftTodoAction() {
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const result = await syncMicrosoftTodo(connection.id, userId);
  await audit(supabase, userId, "sync", connection.id, result);
  revalidatePath("/tasks");
}

const completeSchema = z.object({ taskId: z.string().uuid() });

export async function completeMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = completeSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await completeMicrosoftTodoTask(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "complete", parsed.data.taskId, { provider: "microsoft_todo" });
  revalidatePath("/tasks");
}
