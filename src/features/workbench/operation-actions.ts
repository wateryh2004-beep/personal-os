"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { revalidatePath } from "@/lib/workspace-revalidation";
import { createAdminClient } from "@/lib/supabase/admin";
import { readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { verifyFileStream } from "@/features/files/integrity";
import { metadataCommandSchema, type MetadataCommand, type OperationResult } from "./operation-contracts";
import { undoProviderReceipt } from "./operation-provider";

function failure(error: unknown): OperationResult {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return { status: /conflict/.test(message) ? "conflict" : "error", message: /conflict/.test(message) ? "记录已在其他地方修改，请重新读取后核对。" : /expired/.test(message) ? "这项撤销已过期。" : /original/.test(message) ? "原件未能通过校验，文件仍保留在归档区。" : "操作未能完成，请重新读取后重试。" };
}
export async function applyMetadataOperation(input: unknown): Promise<OperationResult> {
  const parsed = metadataCommandSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "操作参数无效。" };
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("apply_workbench_metadata", { p_request_id: parsed.data.requestId, p_operation: parsed.data.operation, p_items: parsed.data.items });
  if (error) return failure(error);
  await refreshOperationWorkspaces();
  return { status: "success", message: "已保存，可从最近操作撤销。", receiptId: data.receiptStatus === "undone" ? undefined : data.receiptId, rows: data.replayed ? undefined : data.rows, requestId: parsed.data.requestId };
}
export async function readMetadataOperationTargets(kind: "note" | "document", ids: string[]) {
  const parsed = z.object({ kind: z.enum(["note", "document"]), ids: z.array(z.string().uuid()).min(1).max(20) }).parse({ kind, ids });
  const { supabase } = await requireOwner();
  const table = parsed.kind === "note" ? "notes" : "documents";
  const { data, error } = await supabase.from(table).select("id,title,folder_id,mutation_revision").in("id", [...new Set(parsed.ids)]).is("archived_at", null);
  if (error || data?.length !== new Set(parsed.ids).size) throw new Error("workbench_missing");
  return data as { id: string; title: string; folder_id: string | null; mutation_revision: number }[];
}
/** A missing baseline belongs to an old client; never substitute a newer server read. */
export async function runMetadataForm(operation: MetadataCommand["operation"], formData: FormData, kind: "note" | "document"): Promise<{ saved: true; receiptId?: string; savedRevision?: number }> {
  const id = z.string().uuid().parse(formData.get(kind === "note" ? "note_id" : "document_id"));
  const baseline = formData.get("expected_revision");
  if (typeof baseline !== "string" || !/^[0-9]+$/.test(baseline) || !Number.isSafeInteger(Number(baseline))) throw new Error("请重新打开操作，读取最新记录后重试。");
  const request = formData.get("request_id");
  const result = await applyMetadataOperation({ requestId: request || crypto.randomUUID(), operation, items: [{ id, expectedRevision: Number(baseline), ...(operation.endsWith("rename") ? { title: String(formData.get("title") || "") } : {}), ...(operation.endsWith("move") ? { folderId: String(formData.get("folder_id") || "") || null } : {}) }] });
  if (result.status !== "success") throw new Error(result.message);
  const committed = z.array(z.object({ id: z.uuid(), mutation_revision: z.number().int().nonnegative() }).passthrough()).safeParse(result.rows);
  const savedRevision = committed.success ? committed.data.find(row => row.id === id)?.mutation_revision : undefined;
  return { saved: true as const, receiptId: result.receiptId, savedRevision };
}
export async function listWorkbenchOperations() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("workspace_action_receipts").select("id,operation,status,target_id,created_at,expires_at,after_data,before_data").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("workbench_history_unavailable");
  return (data??[]).map(row=>{
    const after=row.after_data;
    const first=Array.isArray(after)?after[0]:after;
    const title=first&&typeof first==="object"?(typeof first.title==="string"?first.title:typeof first.subject==="string"?first.subject:null):null;
    return {id:String(row.id),operation:String(row.operation),status:row.status==="available"&&Date.parse(row.expires_at)<=Date.now()?"expired":String(row.status),target_id:String(row.target_id),created_at:String(row.created_at),expires_at:String(row.expires_at),title:title??`记录 ${String(row.target_id).slice(0,8)}`,count:Array.isArray(after)?after.length:1};
  });
}
async function verifyArchiveOriginals(receiptId: string, userId: string, after: unknown) {
  const rows = z.array(z.object({ id: z.string().uuid(), mutation_revision: z.number().int() }).passthrough()).parse(after);
  const { supabase } = await requireOwner();
  for (const row of rows) {
    const { data: file } = await supabase.from("documents").select("id,storage_path,file_size,checksum,mutation_revision,storage_state").eq("user_id", userId).eq("id", row.id).eq("storage_provider", "cloudflare_r2").maybeSingle();
    if (!file || file.mutation_revision !== row.mutation_revision || file.storage_state !== "archived" || !file.storage_path.startsWith(`${userId}/`)) throw new Error("workbench_conflict");
    const object = await readR2ObjectStream(file.storage_path);
    if (object.size !== Number(file.file_size)) { await object.body.cancel().catch(() => {}); throw new Error("workbench_original_invalid"); }
    await verifyFileStream(object.body, Number(file.file_size), file.checksum);
    const { error } = await createAdminClient().from("workspace_original_checks").upsert({ user_id: userId, receipt_id: receiptId, document_id: file.id, mutation_revision: row.mutation_revision, checked_at: new Date().toISOString() });
    if (error) throw new Error("workbench_original_invalid");
  }
}
export async function undoWorkbenchOperation(receiptId: string): Promise<OperationResult> {
  const id = z.string().uuid().safeParse(receiptId);
  if (!id.success) return { status: "error", message: "撤销凭据无效。" };
  const { supabase, userId } = await requireOwner();
  const { data: receipt } = await supabase.from("workspace_action_receipts").select("operation,status,after_data").eq("id", id.data).eq("user_id", userId).maybeSingle();
  if (!receipt) return { status: "error", message: "找不到这项操作。" };
  try {
    if (/^(tasks_|calendar_)/.test(receipt.operation)) {const result=await undoProviderReceipt(id.data,userId);if(result.status==="success")await refreshOperationWorkspaces();return result;}
    if (receipt.operation === "file_archive" && receipt.status !== "undone") await verifyArchiveOriginals(id.data, userId, receipt.after_data);
    const { error } = await supabase.rpc("undo_workbench_operation", { p_receipt_id: id.data });
    if (error) return failure(error);
    await refreshOperationWorkspaces();
    return { status: "success", message: "已撤销。", receiptId: id.data };
  } catch (error) { return failure(error); }
}
export async function refreshOperationWorkspaces() {
  for (const path of ["/notes", "/files", "/tasks", "/calendar", "/projects", "/career", "/shopping", "/travel", "/leisure", "/today"]) {
    try { await revalidatePath(path); } catch { /* The transaction is already committed; a read can recover presentation. */ }
  }
}

export async function previewWorkbenchUndo(receiptId:string){
 const id=z.string().uuid().parse(receiptId);const {supabase,userId}=await requireOwner();
 const [{data:r},{data:profile}]=await Promise.all([supabase.from("workspace_action_receipts").select("id,operation,status,target_id,before_data,after_data,expires_at").eq("id",id).eq("user_id",userId).maybeSingle(),supabase.from("profiles").select("timezone").eq("user_id",userId).maybeSingle()]);
 if(!r)throw new Error("workbench_missing");
 const timezone=String(profile?.timezone||"Asia/Shanghai");
 const objects=(value:unknown):Record<string,unknown>[]=>{if(Array.isArray(value))return value.filter(item=>Boolean(item)&&typeof item==="object");if(value&&typeof value==="object"){const object=value as Record<string,unknown>;return Array.isArray(object.items)?objects(object.items):[object];}return [];};
 const before=objects(r.before_data),after=objects(r.after_data);
 const definitions:Record<string,{table:string;title:string}>={note_rename:{table:"notes",title:"title"},note_move:{table:"notes",title:"title"},note_trash:{table:"notes",title:"title"},note_archive:{table:"notes",title:"title"},file_rename:{table:"documents",title:"title"},file_move:{table:"documents",title:"title"},file_archive:{table:"documents",title:"title"},tasks_update:{table:"microsoft_todo_tasks",title:"title"},tasks_complete:{table:"microsoft_todo_tasks",title:"title"},calendar_update:{table:"calendar_events",title:"subject"},shopping_quantity:{table:"purchase_items",title:"title"},shopping_purchased:{table:"purchase_items",title:"title"},travel_stop_metadata:{table:"trip_stops",title:"place_name"},travel_stop_arrival:{table:"trip_stops",title:"place_name"},travel_stop_order:{table:"trip_stops",title:"place_name"},travel_next_stop:{table:"trips",title:"title"},travel_document:{table:"trips",title:"title"},leisure_progress:{table:"leisure_experiences",title:"title"}};
 const def=definitions[r.operation];let title="关联记录";
 if(def){const {data:target}=await supabase.from(def.table).select(def.title).eq("id",r.target_id).maybeSingle();const metadata=target as Record<string,unknown>|null;if(metadata&&typeof metadata[def.title]==="string")title=String(metadata[def.title]);else title="已归档或暂不可见的记录";}
 const labels:Record<string,string>={bodyText:"正文",title:"标题",subject:"标题",folder_id:"文件夹",status:"状态",archived_at:"归档",deleted_at:"回收站",dueAt:"截止时间",importance:"重要性",completedAt:"完成时间",startsAt:"开始",endsAt:"结束",isAllDay:"全天",locationName:"地点",categories:"分类",showAs:"忙闲状态",quantity:"数量",quantity_unit:"单位",day_number:"天数",planned_time:"计划时间",duration_minutes:"停留分钟",arrived_at:"到达标记",sort_order:"顺序",current_stop_id:"当前站",next_stop_id:"下一站",document_id:"票据",linked:"关联",progress_value:"进度",progress_unit:"单位",progress_note:"进度说明",progress_kind:"进度类型"};
 const values:Record<string,string>={notStarted:"未开始",inProgress:"进行中",completed:"已完成",waitingOnOthers:"等待他人",deferred:"已延后",active:"正常",trashed:"回收站",archived:"归档",normal:"普通",low:"低",high:"高",free:"空闲",busy:"忙碌",tentative:"暂定"};
 const format=async(key:string,value:unknown):Promise<string>=>{
  if(value===null||value===undefined||value==="")return key==="folder_id"?"根目录":"未设置";
  if(key==="folder_id"){const table=r.operation.startsWith("note_")?"note_folders":"file_folders";const {data:folder}=await supabase.from(table).select("name").eq("id",String(value)).maybeSingle();return folder?.name??"原文件夹不可见";}
  if(key.endsWith("_stop_id")){const {data:stop}=await supabase.from("trip_stops").select("place_name").eq("id",String(value)).maybeSingle();return stop?.place_name??"原地点不可见";}
  if(key==="document_id"){const {data:file}=await supabase.from("documents").select("title").eq("id",String(value)).maybeSingle();return file?.title??"原票据不可见";}
  if(["archived_at","deleted_at","arrived_at"].includes(key))return "已标记";
  if(["dueAt","completedAt","startsAt","endsAt"].includes(key)&&typeof value==="string"&&Number.isFinite(Date.parse(value)))return new Intl.DateTimeFormat("zh-CN",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(value));
  if(key==="bodyText"&&typeof value==="string")return value;
  if(typeof value==="boolean")return value?"是":"否";if(Array.isArray(value))return value.map(String).join("、")||"未设置";return values[String(value)]??String(value).slice(0,500);
 };
 const changes:{label:string;before:string;after:string}[]=[];
 for(let index=0;index<Math.min(after.length,20);index++){const current=after[index];const previous=before.find(row=>row.id===current.id)??before[index]??{};for(const [key,label]of Object.entries(labels)){if(!(key in current)&&!(key in previous))continue;if(JSON.stringify(current[key])===JSON.stringify(previous[key]))continue;changes.push({label:after.length>1?`${index+1}. ${label}`:label,before:await format(key,current[key]),after:await format(key,previous[key])});}}
 if(r.operation==="graph_link")changes.push({label:"关联",before:"已建立",after:r.before_data?.existed?"恢复原关联状态":"移除此关联，保留双方记录"});
 return {receiptId:id,title,count:after.length,operation:String(r.operation),status:r.status==="available"&&Date.parse(r.expires_at)<=Date.now()?"expired":String(r.status),expiresAt:String(r.expires_at),timezone,provider:/^(tasks_|calendar_)/.test(r.operation),changes};
}

/** Receipt determines the finite domain and IDs; browsers never choose a table. */
export async function readWorkbenchReceiptState(receiptId:string){
 const id=z.string().uuid().parse(receiptId);const {supabase,userId}=await requireOwner();const {data:r}=await supabase.from("workspace_action_receipts").select("operation,before_data,after_data,target_id").eq("id",id).eq("user_id",userId).maybeSingle();if(!r)throw new Error("workbench_missing");
 const rows=Array.isArray(r.after_data)?r.after_data:[];const ids=rows.map((row:Record<string,unknown>)=>String(row.id)).slice(0,20);
 if(r.operation.startsWith("file_")){const {data,error}=await supabase.from("documents").select("id,title,original_filename,mime_type,file_size,folder_id,uploaded_at,created_at,archived_at,ai_visibility,text_extraction_status,extracted_character_count,mutation_revision").in("id",ids);if(error)throw new Error("workbench_read_unavailable");return {kind:"document" as const,rows:data??[]};}
 return {kind:"other" as const,rows:[]};
}
