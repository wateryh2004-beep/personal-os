"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { executeCalendarOperation } from "@/lib/adapters/microsoft-graph/calendar";
import { cancelOperationSchema, confirmOperationSchema, createCalendarEventSchema } from "./schemas";
import { calendarPayload } from "./utils";

export type CalendarCreateState = { status: "idle" | "success" | "error"; message: string };

function fail(): never { throw new Error("日历操作未能完成，请检查输入、连接状态或网络后重试。"); }
function formValue(formData: FormData) {
  return {
    subject: String(formData.get("subject") || ""),
    startsAt: String(formData.get("starts_at") || ""),
    endsAt: String(formData.get("ends_at") || ""),
    locationName: String(formData.get("location_name") || ""),
    isAllDay: formData.get("is_all_day") === "on",
  };
}
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityId: string, afterData: Record<string, unknown>) {
  const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "calendar_operation", entity_id: entityId, after_data: afterData, actor_type: "user" });
  if (error) fail();
}
async function connection(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const { data, error } = await supabase.from("calendar_connections").select("id,status").is("archived_at", null).maybeSingle();
  if (error || !data || data.status !== "enabled") fail();
  return data;
}

export async function createCalendarEvent(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  try {
    const { supabase, userId } = await requireOwner();
    const parsed = createCalendarEventSchema.safeParse(formValue(formData));
    if (!parsed.success) return { status: "error", message: "请检查日程标题和开始、结束时间。" };
    const activeConnection = await connection(supabase);
    const { data: requested, error: requestError } = await supabase.from("calendar_operations").insert({
      user_id: userId,
      connection_id: activeConnection.id,
      operation_type: "create",
      status: "pending_confirmation",
      payload: calendarPayload(parsed.data),
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "create", subject: parsed.data.subject, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt });

    // 点击“创建日程”即为唯一的用户确认；队列仍保留完整的状态与审计记录。
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: queued.operation_type, confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch { return { status: "error", message: "日程未能写入 Outlook。请检查连接状态后重试。" }; }
    revalidatePath("/calendar");
    return { status: "success", message: "已创建并同步到 Outlook。" };
  } catch {
    return { status: "error", message: "日程未能创建。请检查连接状态或网络后重试。" };
  }
}

export async function confirmCalendarOperation(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = confirmOperationSchema.safeParse({ operationId: formData.get("operation_id") });
  if (!parsed.success) fail();
  const { data, error } = await supabase.from("calendar_operations").update({ status: "queued", confirmed_at: new Date().toISOString() }).eq("id", parsed.data.operationId).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "confirm", data.id, { operation_type: data.operation_type });
  try { await executeCalendarOperation(data.id, userId); } catch { /* The operation stores a safe error code; render it instead of crashing the page. */ }
  revalidatePath("/calendar");
}

export async function cancelCalendarOperation(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = cancelOperationSchema.safeParse({ operationId: formData.get("operation_id") });
  if (!parsed.success) fail();
  const { data, error } = await supabase.from("calendar_operations").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", parsed.data.operationId).in("status", ["pending_confirmation", "queued"]).select("id,operation_type").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "cancel", data.id, { operation_type: data.operation_type });
  revalidatePath("/calendar");
}

export async function queueCalendarSync() {
  const { supabase, userId } = await requireOwner();
  const activeConnection = await connection(supabase);
  const { data, error } = await supabase.from("calendar_operations").insert({ user_id: userId, connection_id: activeConnection.id, operation_type: "sync", status: "queued" }).select("id").single();
  if (error || !data) fail();
  await audit(supabase, userId, "request", data.id, { operation_type: "sync" });
  try { await executeCalendarOperation(data.id, userId); } catch { /* The operation stores a safe error code; render it instead of crashing the page. */ }
  revalidatePath("/calendar");
}
