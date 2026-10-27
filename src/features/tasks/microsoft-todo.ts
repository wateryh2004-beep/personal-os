"use server";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTodoMetadataOperation } from "@/features/workbench/operation-provider";
import { revalidatePath } from "@/lib/workspace-revalidation";
import { z } from "zod";
import { syncMicrosoftTodo } from "@/lib/adapters/microsoft-graph/todo";
import { microsoftTodoRepository } from "./repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { markInboxProcessed } from "@/features/inbox/service";
import { syncEntityReferenceLinks } from "@/features/links/service";
import { taskBodyCharacterLimit } from "./limits";

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
  await revalidatePath("/tasks");
}

export async function syncAndBackupMicrosoftTodoAction() {
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await syncAndBackupMicrosoftWorkspace(connection.id, userId, "manual");
  await revalidatePath("/tasks");
  await revalidatePath("/calendar");
}

const completeSchema = z.object({ taskId: z.string().uuid() });
const deferSchema = z.object({ taskId: z.string().uuid(), dueAt: z.string().datetime({ offset: true }) });
const deleteSchema = z.object({ taskId: z.string().uuid() });
const updateSchema = z.object({
  taskId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  expected: z.object({title:z.string().optional(),lastModifiedAt:z.string().nullable().optional(),status:z.string().optional()}).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  bodyText: z.string().max(10_000).nullable().optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => value.title !== undefined || value.bodyText !== undefined || value.importance !== undefined || value.dueAt !== undefined, { message: "至少修改一个字段" });
const createSchema = z.object({
  requestId: z.string().uuid().optional(),
  todoListId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().max(taskBodyCharacterLimit).transform((value) => value || null),
  importance: z.enum(["low", "normal", "high"]),
  dueAt: z.string().nullable().refine((value) => value === null || !Number.isNaN(Date.parse(value))).transform((value) => value ? new Date(value).toISOString() : null),
  inboxId: z.string().uuid().optional(),
});

export type TodoCreateState = { status: "idle" | "success" | "error"; message: string; taskId?: string };

export async function createMicrosoftTodoTaskAction(_: TodoCreateState, formData: FormData): Promise<TodoCreateState> {
  const dueAtValue = String(formData.get("due_at") || "");
  const parsed = createSchema.safeParse({
    requestId: formData.get("request_id") || undefined,
    todoListId: formData.get("todo_list_id"),
    title: formData.get("title"),
    bodyText: formData.get("body_text"),
    importance: formData.get("importance") || "normal",
    dueAt: dueAtValue || null,
    inboxId: formData.get("inbox_id") || undefined,
  });
  if (!parsed.success) {
    const bodyIssue = parsed.error.issues.find(issue => issue.path[0] === "bodyText");
    return { status: "error", message: bodyIssue?.code === "too_big"
      ? `任务正文最多 ${taskBodyCharacterLimit.toLocaleString("en-US")} 个字符（包含来源链接）。请缩短正文或选区，也可仅使用来源链接。`
      : bodyIssue ? "任务正文格式无效，请检查后重试。" : "请检查任务标题、清单和截止时间。" };
  }
  try {
    const { supabase, userId } = await requireOwner();
    const connection = await activeConnection(supabase);
    const admin = createAdminClient();
    const requestId = parsed.data.inboxId ?? parsed.data.requestId ?? randomUUID();
    const requestHash = createHash("sha256").update(JSON.stringify({ ...parsed.data, requestId: undefined })).digest("hex");
    const prepared = parsed.data.inboxId
      ? await admin.rpc("prepare_inbox_todo_creation", { p_owner: userId, p_inbox_id: parsed.data.inboxId, p_request_hash: requestHash })
      : await admin.from("todo_creation_receipts").upsert({ user_id: userId, request_id: requestId, request_hash: requestHash, inbox_id: null }, { onConflict: "user_id,request_id", ignoreDuplicates: true });
    if (prepared.error) return { status: "error", message: "这条内容已有其他去向或提交内容不一致，尚未重复发送；请保留输入并核对。" };
    const { data: receipt, error: receiptError } = await admin.from("todo_creation_receipts").select("id,request_hash,status,task_id").eq("user_id", userId).eq("request_id", requestId).single();
    if (receiptError || !receipt || receipt.request_hash !== requestHash) return { status: "error", message: "本次请求内容与已提交记录不一致，请先核对已创建任务。" };
    let taskId: string = receipt.task_id;
    if (!taskId) {
      const claimed = await admin.from("todo_creation_receipts").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", receipt.id).eq("user_id", userId).eq("status", "prepared").select("id").maybeSingle();
      if (claimed.error || !claimed.data) return { status: "error", message: "上次创建结果仍待核对，系统不会重复发送。请到任务清单核对后再处理来源。" };
      try {
        taskId = await microsoftTodoRepository.create(connection.id, userId, parsed.data);
        const committed = await admin.from("todo_creation_receipts").update({ status: "remote_committed", task_id: taskId, updated_at: new Date().toISOString() }).eq("id", receipt.id).eq("user_id", userId).select("id").single();
        if (committed.error || !committed.data) throw new Error("todo_commit_unconfirmed");
      } catch (error) {
        const notWritten = error instanceof Error && "writeOutcome" in error && error.writeOutcome === "not_written";
        const recorded = await admin.from("todo_creation_receipts").update({ status: notWritten ? "rejected" : "unknown", updated_at: new Date().toISOString() }).eq("id", receipt.id).eq("user_id", userId).eq("status", "processing");
        if (recorded.error) return { status: "error", message: "本地执行记录仍待确认，原内容和输入已保留；系统暂不重复发送。" };
        if (notWritten) return { status: "error", message: "本次任务未写入，原内容和输入已保留；修正或重新连接后，可再次确认创建，也可选择其他去向。" };
        return { status: "error", message: "创建结果尚未确认，系统不会重发。请在 Microsoft To Do 核对，输入已保留。" };
      }
    }
    if (receipt.status !== "available") {
      const marked = await markInboxProcessed(supabase, userId, parsed.data.inboxId, "task", taskId);
      if (!marked) return { status: "error", message: "任务已创建，来源处理尚未确认；重试只会修复来源，不会重复创建任务。", taskId };
      const finished = await admin.rpc("finish_todo_creation_receipt", { p_receipt_id: receipt.id, p_owner: userId });
      if (finished.error || finished.data !== true) return { status: "error", message: "任务已创建，记录仍待确认；可安全重试核对。", taskId };
    }
    const bodyLinkSync = await syncEntityReferenceLinks(supabase, userId, "todo_task", taskId, parsed.data.bodyText ?? "");
    if (!bodyLinkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_entity_reference_links", taskId, code: bodyLinkSync.code }));
    await revalidatePath("/tasks");
    await revalidatePath("/inbox");
    await revalidatePath("/today");
    return { status: "success", message: "任务已写入 Microsoft To Do。", taskId };
  } catch {
    return { status: "error", message: "任务未能写入 Microsoft To Do。请稍后重试或重新连接。" };
  }
}

export async function completeMicrosoftTodoTaskAction(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const { userId } = await requireOwner();
  const result = await runTodoMetadataOperation({userId,taskId,requestId:z.string().uuid().parse(formData.get("request_id") || crypto.randomUUID()),operation:"tasks_complete",patch:{status:"completed"},...(formData.has("expected_status")?{expected:{status:String(formData.get("expected_status")),title:String(formData.get("expected_title")),lastModifiedAt:String(formData.get("expected_modified")||"")||null}}:{})});
  if(result.status!=="success") throw new Error(result.message);
  await revalidatePath("/tasks"); await revalidatePath("/today");
  return result;
}

/** User-triggered defer; the provider-backed task remains the sole authority. */
export async function deferMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = deferSchema.safeParse({ taskId: formData.get("task_id"), dueAt: formData.get("due_at") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const { data: before } = await supabase.from("microsoft_todo_tasks").select("due_at,title").eq("id", parsed.data.taskId).is("archived_at", null).maybeSingle();
  await microsoftTodoRepository.update(connection.id, userId, parsed.data.taskId, { dueAt: parsed.data.dueAt });
  await audit(supabase, userId, "defer", parsed.data.taskId, { provider: "microsoft_todo", before, due_at: parsed.data.dueAt });
  await revalidatePath("/tasks");
  await revalidatePath("/today");
}

export async function updateMicrosoftTodoTaskAction(input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new Error("任务更新内容无效。");
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const { data: before } = await supabase.from("microsoft_todo_tasks").select("title,body_text,importance,due_at").eq("id", parsed.data.taskId).is("archived_at", null).maybeSingle();
  if (parsed.data.bodyText === undefined) {
    const patch={...(parsed.data.title!==undefined?{title:parsed.data.title}:{}),...(parsed.data.importance!==undefined?{importance:parsed.data.importance}:{}),...(parsed.data.dueAt!==undefined?{dueAt:parsed.data.dueAt}:{})};
    const result=await runTodoMetadataOperation({userId,taskId:parsed.data.taskId,requestId:parsed.data.requestId??crypto.randomUUID(),patch,expected:parsed.data.expected});
    if(result.status!=="success") throw new Error(result.message);
    await revalidatePath("/tasks"); await revalidatePath("/today"); return result;
  }
  await microsoftTodoRepository.update(connection.id, userId, parsed.data.taskId, parsed.data);
  await audit(supabase, userId, "update", parsed.data.taskId, { provider: "microsoft_todo", before, patch: parsed.data });
  if (parsed.data.bodyText !== undefined) {
    const bodyLinkSync = await syncEntityReferenceLinks(supabase, userId, "todo_task", parsed.data.taskId, parsed.data.bodyText ?? "");
    if (!bodyLinkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_entity_reference_links", taskId: parsed.data.taskId, code: bodyLinkSync.code }));
  }
  await revalidatePath("/tasks");
  await revalidatePath("/today");
}

export async function deleteMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = deleteSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  const { data: before } = await supabase.from("microsoft_todo_tasks").select("title,status,todo_list_id").eq("id", parsed.data.taskId).is("archived_at", null).maybeSingle();
  await microsoftTodoRepository.delete(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "delete", parsed.data.taskId, { provider: "microsoft_todo", before });
  await revalidatePath("/tasks");
  await revalidatePath("/today");
}

export async function reopenMicrosoftTodoTaskAction(formData: FormData) {
  const parsed = completeSchema.safeParse({ taskId: formData.get("task_id") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const connection = await activeConnection(supabase);
  await microsoftTodoRepository.reopen(connection.id, userId, parsed.data.taskId);
  await audit(supabase, userId, "reopen", parsed.data.taskId, { provider: "microsoft_todo" });
  await revalidatePath("/tasks");
  await revalidatePath("/today");
}

const batchSchema=z.object({requestId:z.string().uuid(),items:z.array(z.object({requestId:z.string().uuid(),taskId:z.string().uuid(),expected:z.object({title:z.string(),lastModifiedAt:z.string().nullable(),status:z.string()}),patch:z.object({dueAt:z.string().datetime({offset:true}).nullable().optional(),importance:z.enum(["low","normal","high"]).optional()}).refine(p=>Object.keys(p).length>0)})).min(1).max(20)}).strict();
/** Provider batch is intentionally per-item. Never retry a dispatched unknown write. */
export async function applyTodoBatch(input:unknown) {
 const value=batchSchema.parse(input); if(new Set(value.items.map(row=>row.taskId)).size!==value.items.length || new Set(value.items.map(row=>row.requestId)).size!==value.items.length) throw new Error("任务不能重复。");
 const {userId}=await requireOwner(); const results=[];
 for(const item of value.items) { try{const result=await runTodoMetadataOperation({userId,...item}); results.push({taskId:item.taskId,...result});}catch{results.push({taskId:item.taskId,status:"error" as const,message:"该项未能确认，其他项结果保留。",requestId:item.requestId});} }
 await revalidatePath("/tasks"); await revalidatePath("/today"); return results;
}
