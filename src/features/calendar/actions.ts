"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { cancelOperationSchema, confirmOperationSchema, createCalendarEventSchema } from "./schemas";
import { calendarPayload } from "./utils";

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

export async function enableCalendarCompanion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const label = String(formData.get("label") || "此 Mac").trim().slice(0, 120) || "此 Mac";
  const { data, error } = await supabase.from("calendar_connections").upsert({ user_id: userId, label, status: "enabled", archived_at: null }, { onConflict: "user_id" }).select("id").single();
  if (error || !data) fail();
  await audit(supabase, userId, "enable", data.id, { operation: "calendar_companion" });
  revalidatePath("/calendar");
}

export async function requestCalendarEvent(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = createCalendarEventSchema.safeParse(formValue(formData));
  if (!parsed.success) fail();
  const activeConnection = await connection(supabase);
  const { data, error } = await supabase.from("calendar_operations").insert({
    user_id: userId,
    connection_id: activeConnection.id,
    operation_type: "create",
    status: "pending_confirmation",
    payload: calendarPayload(parsed.data),
  }).select("id").single();
  if (error || !data) fail();
  await audit(supabase, userId, "request", data.id, { operation_type: "create", subject: parsed.data.subject, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt });
  revalidatePath("/calendar");
}

export async function confirmCalendarOperation(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = confirmOperationSchema.safeParse({ operationId: formData.get("operation_id") });
  if (!parsed.success) fail();
  const { data, error } = await supabase.from("calendar_operations").update({ status: "queued", confirmed_at: new Date().toISOString() }).eq("id", parsed.data.operationId).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "confirm", data.id, { operation_type: data.operation_type });
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
  revalidatePath("/calendar");
}
