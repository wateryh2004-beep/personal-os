import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/auth/require-owner";
import { readMicrosoftTodoMutationSnapshot, patchMicrosoftTodoMetadata, sameTodoMutationSnapshot, readCalendarMutationSnapshot, sameCalendarMutationSnapshot, executeCalendarOperation, type CalendarMutationSnapshot, type TodoMetadataPatch } from "@/lib/adapters/microsoft-graph/calendar";
import type { OperationResult } from "./operation-contracts";
const snapshotSchema = z.object({ id: z.string().uuid(), title: z.string(), importance: z.enum(["low", "normal", "high"]), dueAt: z.string().nullable(), status: z.enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"]), completedAt: z.string().nullable(), lastModifiedAt: z.string().nullable(), etag: z.string().nullable() });
export function operationRequestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export async function activeOperationConnection(userId: string) {
  const { data } = await createAdminClient().from("calendar_connections").select("id,status").eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (!data || data.status !== "enabled") throw new Error("microsoft_disconnected");
  return data.id as string;
}
export async function prepareProviderReceipt(input: { userId: string; requestId: string; operation: "tasks_update" | "tasks_complete" | "calendar_create" | "calendar_update"; targetId: string; request: unknown }) {
  const admin = createAdminClient(); const hash = operationRequestHash(input.request);
  const { error } = await admin.from("workspace_action_receipts").upsert({ user_id: input.userId, request_id: input.requestId, request_hash: hash, operation: input.operation, target_id: input.targetId, before_data: {}, after_data: {}, status: "prepared" }, { onConflict: "user_id,request_id", ignoreDuplicates: true });
  if (error) throw new Error("operation_prepare_failed");
  const { data: row } = await admin.from("workspace_action_receipts").select("*").eq("user_id", input.userId).eq("request_id", input.requestId).single();
  if (!row || row.request_hash !== hash || row.operation !== input.operation) throw new Error("workbench_request_conflict");
  if (row.status !== "prepared") return { row, claimed: false };
  const { data: claimed } = await admin.from("workspace_action_receipts").update({ status: "processing" }).eq("id", row.id).eq("user_id", input.userId).eq("status", "prepared").select("id").maybeSingle();
  return { row, claimed: Boolean(claimed) };
}
export async function runTodoMetadataOperation(input: { userId: string; requestId: string; taskId: string; patch: TodoMetadataPatch; expected?: { title?: string; lastModifiedAt?: string | null; status?: string }; operation?: "tasks_update" | "tasks_complete" }): Promise<OperationResult> {
  const admin = createAdminClient();
  const intent = await prepareProviderReceipt({ ...input, operation: input.operation ?? "tasks_update", targetId: input.taskId, request: { taskId: input.taskId, patch: input.patch, expected: input.expected ?? null } });
  if (!intent.claimed) return intent.row.status === "available" || intent.row.status === "undone" ? { status: "success", receiptId: intent.row.status === "available" ? intent.row.id : undefined, message: "该操作已经处理。" } : { status: "unknown", message: "操作仍在核对；保留相同请求编号，不会重复写入。", requestId: input.requestId };
  let dispatched = false;
  try {
    const connectionId = await activeOperationConnection(input.userId);
    const before = await readMicrosoftTodoMutationSnapshot(connectionId, input.userId, input.taskId);
    if (input.expected && ((input.expected.title !== undefined && input.expected.title !== before.title) || (input.expected.status !== undefined && input.expected.status !== before.status) || (input.expected.lastModifiedAt !== undefined && input.expected.lastModifiedAt !== before.lastModifiedAt))) throw new Error("graph_conflict");
    const saved=await admin.from("workspace_action_receipts").update({ before_data: before, after_data: { intendedPatch: input.patch } }).eq("id", intent.row.id).eq("user_id", input.userId);
    if(saved.error)throw new Error("operation_prepare_failed");
    dispatched = true;
    const result = await patchMicrosoftTodoMetadata(connectionId, input.userId, input.taskId, before, input.patch);
    const { error } = await admin.rpc("finish_workbench_provider_receipt", { p_receipt_id: intent.row.id, p_owner: input.userId, p_after: {...result.after, changedFields: [...new Set([...Object.keys(input.patch), ...(input.patch.status === "completed" ? ["completedAt"] : [])])]}, p_status: result.cacheSaved ? "available" : "remote_committed" });
    if (error || !result.cacheSaved) return { status: "unknown", message: "Microsoft 已保存，缓存或撤销收据仍待核对，请勿重复提交。" };
    return { status: "success", message: "已保存到 Microsoft To Do。", receiptId: intent.row.id, rows: [result.after] };
  } catch (error) {
    const code = error instanceof Error ? error.message : "operation_failed";
    const conflict = code === "graph_conflict";
    const unknown = dispatched && !conflict && code !== "graph_not_found" && code !== "graph_invalid_request" && code !== "graph_access_denied";
    await admin.from("workspace_action_receipts").update({ status: conflict ? "conflict" : unknown ? "unknown" : "failed" }).eq("id", intent.row.id).eq("user_id", input.userId);
    return { status: conflict ? "conflict" : unknown ? "unknown" : "error", message: conflict ? "Microsoft 任务已发生变化，未覆盖它。请重新读取。" : unknown ? "远端结果尚未确认，系统不会重复发送；请重新读取核对。" : "任务未能保存。", requestId: input.requestId };
  }
}
export async function undoProviderReceipt(receiptId: string, userId: string): Promise<OperationResult> {
  await requireOwner();
  const admin = createAdminClient();
  const { data: receipt } = await admin.from("workspace_action_receipts").select("*").eq("id", receiptId).eq("user_id", userId).maybeSingle();
  if (!receipt) return { status: "error", message: "找不到操作收据。" };
  if (receipt.status === "undone") return { status: "success", message: "已撤销。" };
  if (receipt.status !== "available" || Date.parse(receipt.expires_at) <= Date.now()) return { status: "error", message: "该操作尚不可撤销或已过期。" };
  if(receipt.operation === "calendar_update"){
    const before=receipt.before_data as CalendarMutationSnapshot;const after=receipt.after_data as CalendarMutationSnapshot;
    const connectionId=await activeOperationConnection(userId);const current=await readCalendarMutationSnapshot(connectionId,userId,after.providerEventId);
    if(!sameCalendarMutationSnapshot(current,after))return {status:"conflict",message:"日程已有后续修改，未撤销。"};
    const allowedFields=Array.isArray(receipt.after_data.patchFields)?receipt.after_data.patchFields:null;
    const fields:string[]=[];for(const [key,graphKey] of [["subject","subject"],["startsAt","start"],["endsAt","end"],["isAllDay","isAllDay"],["locationName","location"],["categories","categories"],["importance","importance"],["showAs","showAs"]] as const)if((!allowedFields||allowedFields.includes(graphKey))&&JSON.stringify(before[key])!==JSON.stringify(after[key]))fields.push(graphKey);
    const {data:profile}=await admin.from("profiles").select("timezone").eq("user_id",userId).maybeSingle();
    const result=await runCalendarMetadataOperation({userId,requestId:receipt.id,localEventId:receipt.target_id,expected:after,payload:{...before,description:null,timeZone:profile?.timezone||"Asia/Shanghai",patchFields:fields},undoAvailable:true});
    if(result.status==="success")await admin.from("workspace_action_receipts").update({status:"undone",undone_at:new Date().toISOString()}).eq("id",receipt.id).eq("user_id",userId).eq("status","available");
    return result.status==="success"?{status:"success",message:"已向Outlook提交补偿。"}:result;
  }
  if (!receipt.operation.startsWith("tasks_")) return { status: "error", message: "此操作不可撤销。" };
  const before = snapshotSchema.parse(receipt.before_data); const after = snapshotSchema.parse(receipt.after_data);
  const connectionId = await activeOperationConnection(userId);
  const current = await readMicrosoftTodoMutationSnapshot(connectionId, userId, receipt.target_id);
  if (!sameTodoMutationSnapshot(current, after)) return { status: "conflict", message: "任务已有后续修改，未撤销。" };
  // A separate stable logical operation protects duplicate compensation dispatch.
  const undoRequestId = receipt.id;
  const patch: TodoMetadataPatch = {};
  const changedFields=Array.isArray(receipt.after_data.changedFields)?receipt.after_data.changedFields:null;
  for (const key of ["title", "importance", "dueAt", "status", "completedAt"] as const) if ((!changedFields||changedFields.includes(key))&&before[key] !== after[key]) Object.assign(patch, { [key]: before[key] });
  // The original request id differs from receipt.id; this is a deterministic undo key.
  const result = await runTodoMetadataOperation({ userId, requestId: undoRequestId, taskId: receipt.target_id, expected: { title: after.title, status: after.status, lastModifiedAt: after.lastModifiedAt }, patch });
  if (result.status === "success") await admin.from("workspace_action_receipts").update({ status: "undone", undone_at: new Date().toISOString() }).eq("id", receipt.id).eq("user_id", userId).eq("status", "available");
  return result.status === "success" ? { status: "success", message: "已向 Microsoft To Do 提交补偿。" } : result;
}

export async function runCalendarMetadataOperation(input: { userId:string;requestId:string;localEventId:string;expected:CalendarMutationSnapshot;payload:Record<string,unknown>;undoAvailable:boolean;request?:unknown }):Promise<OperationResult>{
 const {supabase}=await requireOwner();const admin=createAdminClient();
 const intent=await prepareProviderReceipt({userId:input.userId,requestId:input.requestId,operation:"calendar_update",targetId:input.localEventId,request:input.request??{expected:input.expected,payload:input.payload}});
 if(!intent.claimed)return intent.row.status==="available"||intent.row.status==="undone"?{status:"success",receiptId:intent.row.status==="available"?intent.row.id:undefined,message:"该日程操作已处理。"}:{status:"unknown",message:"该日程操作仍待核对，不会重复发送。"};
 let dispatched=false;
 try{
  const connectionId=await activeOperationConnection(input.userId);
  const before=await readCalendarMutationSnapshot(connectionId,input.userId,input.expected.providerEventId);
  if(!sameCalendarMutationSnapshot(before,input.expected))throw new Error("graph_conflict");
  const beforeSaved=await admin.from("workspace_action_receipts").update({before_data:before,after_data:{}}).eq("id",intent.row.id).eq("user_id",input.userId);if(beforeSaved.error)throw new Error("operation_prepare_failed");
  const queued=await supabase.from("calendar_operations").insert({id:input.requestId,user_id:input.userId,request_id:input.requestId,request_hash:operationRequestHash(input.payload),connection_id:connectionId,operation_type:"update",status:"pending_confirmation",provider_event_id:input.expected.providerEventId,payload:{...input.payload,expected:before,previous:{subject:before.subject,startsAt:before.startsAt,endsAt:before.endsAt}}});if(queued.error)throw new Error("calendar_queue_failed");
  const confirmed=await supabase.from("calendar_operations").update({status:"queued",confirmed_at:new Date().toISOString()}).eq("id",input.requestId).eq("user_id",input.userId).eq("status","pending_confirmation").select("id").maybeSingle();if(confirmed.error||!confirmed.data)throw new Error("calendar_queue_failed");
  dispatched=true;await executeCalendarOperation(input.requestId,input.userId);
  const after=await readCalendarMutationSnapshot(connectionId,input.userId,input.expected.providerEventId);
  const finished=await admin.rpc("finish_workbench_provider_receipt",{p_receipt_id:intent.row.id,p_owner:input.userId,p_after:{...after,patchFields:input.payload.patchFields??[]},p_status:input.undoAvailable?"available":"remote_committed"});
  if(finished.error)return {status:"unknown",message:"Outlook已保存，撤销收据仍待核对。"};
  return {status:"success",message:"已更新到Outlook。",receiptId:input.undoAvailable?intent.row.id:undefined};
 }catch(error){const code=error instanceof Error?error.message:"failed";const conflict=code==="graph_conflict";const unknown=dispatched&&!conflict&&!/not_found|invalid_request|access_denied/.test(code);await admin.from("workspace_action_receipts").update({status:conflict?"conflict":unknown?"unknown":"failed"}).eq("id",intent.row.id).eq("user_id",input.userId);return {status:conflict?"conflict":unknown?"unknown":"error",message:conflict?"日程已有后续变化，未覆盖它。":unknown?"Outlook结果尚未确认，请重新读取，系统不会重复发送。":"日程未能更新。"};}
}
