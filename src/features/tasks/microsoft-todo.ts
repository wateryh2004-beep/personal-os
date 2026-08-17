"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { syncMicrosoftTodo } from "@/lib/adapters/microsoft-graph/todo";
import { microsoftTodoRepository } from "./repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { markInboxProcessed } from "@/features/inbox/service";
import { syncEntityReferenceLinks } from "@/features/links/service";

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

export async function syncAndBackupMicrosoftTodoAction() {
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await syncAndBackupMicrosoftWorkspace(connection.id, userId, "manual");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

const completeSchema = z.object({ taskId: z.string().uuid() });
const deleteSchema = z.object({ taskId: z.string().uuid() });
const updateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  bodyText: z.string().max(10_000).nullable().optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => value.title !== undefined || value.bodyText !== undefined || value.importance !== undefined || value.dueAt !== undefined, { message: "至少修改一个字段" });
const createSchema = z.object({
  todoListId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().max(10_000).transform((value) => value || null),
  importance: z.enum(["low", "normal", "high"]),
  dueAt: z.string().nullable().refine((value) => value === null || !Number.isNaN(Date.parse(value))).transform((value) => value ? new Date(value).toISOString() : null),
  inboxId: z.string().uuid().optional(),
});

export type TodoCreateState = { status: "idle" | "success" | "error"; message: string; taskId?: string };

export async function createMicrosoftTodoTaskAction(_: TodoCreateState, formData: FormData): Promise<TodoCreateState> {
  const dueAtValue = String(formData.get("due_at") || "");
  const parsed = createSchema.safeParse({
    todoListId: formData.get("todo_list_id"),
    title: formData.get("title"),
    bodyText: formData.get("body_text"),
    importance: formData.get("importance") || "normal",
    dueAt: dueAtValue || null,
    inboxId: formData.get("inbox_id") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "请检查任务标题、清单和截止时间。" };
  try {
    const { supabase, userId } = await requireOwner();
    const connection = await activeConnection(supabase);
    const taskId = await microsoftTodoRepository.create(connection.id, userId, parsed.data);
    await audit(supabase, userId, "create", taskId, { provider: "microsoft_todo", todo_list_id: parsed.data.todoListId, importance: parsed.data.importance });
    await markInboxProcessed(supabase, userId, parsed.data.inboxId, "task", taskId);
    const bodyLinkSync = await syncEntityReferenceLinks(supabase, userId, "todo_task", taskId, parsed.data.bodyText ?? "");
    if (!bodyLinkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_entity_reference_links", taskId, code: bodyLinkSync.code }));
    revalidatePath("/tasks");
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "任务已写入 Microsoft To Do。", taskId };
  } catch {
    return { status: "error", message: "任务未能写入 Microsoft To Do。请稍后重试或重新连接。" };
  }
}

export async function completeMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = completeSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await microsoftTodoRepository.complete(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "complete", parsed.data.taskId, { provider: "microsoft_todo" });
  revalidatePath("/tasks");
  revalidatePath("/today");
}

export async function updateMicrosoftTodoTaskAction(input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new Error("任务更新内容无效。");
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const { data: before } = await supabase.from("microsoft_todo_tasks").select("title,body_text,importance,due_at").eq("id", parsed.data.taskId).is("archived_at", null).maybeSingle();
  await microsoftTodoRepository.update(connection.id, userId, parsed.data.taskId, parsed.data);
  await audit(supabase, userId, "update", parsed.data.taskId, { provider: "microsoft_todo", before, patch: parsed.data });
  if (parsed.data.bodyText !== undefined) {
    const bodyLinkSync = await syncEntityReferenceLinks(supabase, userId, "todo_task", parsed.data.taskId, parsed.data.bodyText ?? "");
    if (!bodyLinkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_entity_reference_links", taskId: parsed.data.taskId, code: bodyLinkSync.code }));
  }
  revalidatePath("/tasks");
  revalidatePath("/today");
}

export async function deleteMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = deleteSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const { data: before } = await supabase.from("microsoft_todo_tasks").select("title,status,todo_list_id").eq("id", parsed.data.taskId).is("archived_at", null).maybeSingle();
  await microsoftTodoRepository.delete(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "delete", parsed.data.taskId, { provider: "microsoft_todo", before });
  revalidatePath("/tasks");
  revalidatePath("/today");
}

export async function reopenMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = completeSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await microsoftTodoRepository.reopen(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "reopen", parsed.data.taskId, { provider: "microsoft_todo" });
  revalidatePath("/tasks");
  revalidatePath("/today");
}
