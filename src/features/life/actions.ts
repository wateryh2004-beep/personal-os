"use server";
import { revalidatePath } from "@/lib/workspace-revalidation";
import { requireOwner } from "@/lib/auth/require-owner";
import { z } from "zod";
import { lifeFieldInputSchema, lifeFieldResultSchema, lifeFieldRowSchema, type LifeFieldResult } from "./contracts";

/** Fixed domain allowlist; before/after and inverse metadata are database-owned. */
export async function applyLifeFieldOperation(input: unknown): Promise<LifeFieldResult> {
  const parsed = lifeFieldInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: "请检查数量、时间或进度，再保存。" };
  const { supabase } = await requireOwner();
  try {
    const value = parsed.data;
    const { data, error } = await supabase.rpc("apply_life_field_operation", { p_request_id: value.requestId, p_operation: value.operation, p_items: value.items });
    if (error) {
      if (error.code === "40001") return { ok: false, error: "conflict", message: "记录已在别处更新。请读取最新内容后重新确认。" };
      if (error.message.includes("life_purchase_not_ready")) return { ok: false, error: "not_ready", message: "所选项目仍在冷静期或状态已改变，请重新核对。" };
      return { ok: false, error: "unavailable", message: "暂时无法确认保存结果。请先读取最新内容，再重试。" };
    }
    const result = lifeFieldResultSchema.safeParse(data);
    if (!result.success) return { ok: false, error: "unavailable", message: "暂时无法确认保存结果。请先读取最新内容。" };
    // Narrow route invalidation plus the awaited opaque revision cookie keeps
    // Back/prefetch and memory resources current without a whole-page refresh.
    const paths=new Set<string>();
    if(value.operation.startsWith("shopping_")){paths.add("/shopping");for(const row of result.data.rows)paths.add(`/shopping/${row.id}`);}
    else if(value.operation==="leisure_progress"){paths.add("/leisure");for(const row of result.data.rows)paths.add(`/leisure/${row.id}`);}
    else {for(const row of result.data.rows)paths.add(`/travel/${row.trip_id??row.id}`);}
    try {for(const path of paths)await revalidatePath(path);}catch{/* The receipt-backed write is committed; a targeted read reconciles presentation. */}
    return { ok: true, rows: result.data.rows, receiptId: result.data.receiptId, replayed: result.data.duplicate };
  } catch { return { ok: false, error: "unavailable", message: "连接中断，保存结果尚未确认。请读取最新内容。" }; }
}

/** Receipt identity and current rows come from the server, never an event payload. */
export async function readLifeReceiptState(receiptId: unknown): Promise<{ operation: string; rows: import("./contracts").LifeFieldRow[] } | null> {
  if (!z.uuid().safeParse(receiptId).success) return null;
  const { supabase } = await requireOwner();
  try {
    const { data, error } = await supabase.rpc("read_life_receipt_state", { p_receipt_id: receiptId as string });
    if (error) return null;
    const result = z.object({ operation: z.string(), rows: z.array(lifeFieldRowSchema).min(1).max(20) }).safeParse(data);
    if(!result.success)return null;
    if(result.data.operation.startsWith("shopping_")){
      const {data:rows,error:readError}=await supabase.from("purchase_items").select("id,title,category,price_cny,necessity,necessity_confirmed,status,cooldown_until,purchased_at,quantity,quantity_unit,mutation_revision").eq("user_id",(await requireOwner()).userId).in("id",result.data.rows.map(row=>String(row.id))).is("archived_at",null);
      return readError?null:{operation:result.data.operation,rows:rows??[]};
    }
    if(result.data.operation.startsWith("travel_")){
      const {getTrip}=await import("@/features/travel/queries");
      const ids=[...new Set(result.data.rows.map(row=>String(row.trip_id??row.id)))];
      const snapshots=await Promise.all(ids.map(getTrip));
      if(snapshots.some(snapshot=>snapshot.unavailable||!snapshot.trip))return null;
      return {operation:result.data.operation,rows:snapshots.flatMap(snapshot=>[...snapshot.stops.map(stop=>({id:stop.id,trip_id:snapshot.trip!.id,place_name:stop.place_name,day_number:stop.day_number,sort_order:stop.sort_order,latitude:stop.latitude,longitude:stop.longitude,planned_time:stop.planned_time,duration_minutes:stop.duration_minutes,arrived_at:stop.arrived_at,mutation_revision:stop.mutation_revision})),{id:snapshot.trip!.id,status:snapshot.trip!.status,mutation_revision:snapshot.trip!.mutation_revision,current_stop_id:snapshot.trip!.current_stop_id,next_stop_id:snapshot.trip!.next_stop_id},...result.data.rows.filter(row=>row.document_id&&row.id===snapshot.trip!.id).map(row=>({...row,mutation_revision:snapshot.trip!.mutation_revision,linked:snapshot.documents.some(doc=>doc.id===row.document_id)}))])};
    }
    return result.data;
  } catch { return null; }
}
