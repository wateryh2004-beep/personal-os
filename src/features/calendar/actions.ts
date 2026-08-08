"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { executeCalendarOperation } from "@/lib/adapters/microsoft-graph/calendar";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { cancelOperationSchema, confirmOperationSchema, createCalendarEventSchema, deleteCalendarEventSchema, updateCalendarEventSchema } from "./schemas";
import { calendarPayload } from "./utils";
import { markInboxProcessed } from "@/features/inbox/service";
import { z } from "zod";

export type CalendarCreateState = { status: "idle" | "success" | "error"; message: string };

function fail(): never { throw new Error("日历操作未能完成，请检查输入、连接状态或网络后重试。"); }
function formValue(formData: FormData) {
  return {
    subject: String(formData.get("subject") || ""),
    description: String(formData.get("description") || ""),
    startsAt: String(formData.get("starts_at") || ""),
    endsAt: String(formData.get("ends_at") || ""),
    locationName: String(formData.get("location_name") || ""),
    isAllDay: formData.get("is_all_day") === "on",
    inboxId: String(formData.get("inbox_id") || "") || undefined,
  };
}
function deleteFormValue(formData: FormData) {
  return {
    providerEventId: String(formData.get("provider_event_id") || ""),
    subject: String(formData.get("subject") || ""),
    startsAt: String(formData.get("starts_at") || ""),
    endsAt: String(formData.get("ends_at") || ""),
    isAllDay: formData.get("is_all_day") === "on",
  };
}
function updateFormValue(formData: FormData) {
  return {
    ...formValue(formData),
    providerEventId: String(formData.get("provider_event_id") || ""),
    originalSubject: String(formData.get("original_subject") || ""),
    originalStartsAt: String(formData.get("original_starts_at") || ""),
    originalEndsAt: String(formData.get("original_ends_at") || ""),
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
    const form = formValue(formData);
    const parsed = createCalendarEventSchema.safeParse(form);
    if (!parsed.success) return { status: "error", message: "请检查日程标题和开始、结束时间。" };
    const inboxId = z.string().uuid().optional().safeParse(form.inboxId).data;
    const activeConnection = await connection(supabase);
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const { data: requested, error: requestError } = await supabase.from("calendar_operations").insert({
      user_id: userId,
      connection_id: activeConnection.id,
      operation_type: "create",
      status: "pending_confirmation",
      payload: { ...calendarPayload(parsed.data), timeZone: profile?.timezone || "Asia/Shanghai" },
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "create", subject: parsed.data.subject, has_description: Boolean(parsed.data.description), starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt });

    // 点击“创建日程”即为唯一的用户确认；队列仍保留完整的状态与审计记录。
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: queued.operation_type, confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch { return { status: "error", message: "日程未能写入 Outlook。请检查连接状态后重试。" }; }
    await markInboxProcessed(supabase, userId, inboxId, "calendar", queued.id);
    revalidatePath("/calendar");
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "已创建并同步到 Outlook。" };
  } catch {
    return { status: "error", message: "日程未能创建。请检查连接状态或网络后重试。" };
  }
}

export async function updateCalendarEvent(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  try {
    const { supabase, userId } = await requireOwner();
    const parsed = updateCalendarEventSchema.safeParse(updateFormValue(formData));
    if (!parsed.success) return { status: "error", message: "请检查标题以及开始、结束时间。" };
    const value = parsed.data;
    const { data: existing, error: existingError } = await supabase.from("calendar_events")
      .select("provider_event_id,subject,starts_at,ends_at")
      .eq("provider_event_id", value.providerEventId)
      .eq("subject", value.originalSubject)
      .eq("starts_at", value.originalStartsAt)
      .eq("ends_at", value.originalEndsAt)
      .is("archived_at", null)
      .maybeSingle();
    if (existingError || !existing) return { status: "error", message: "该日程已发生变化，请刷新后再修改。" };
    const activeConnection = await connection(supabase);
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const { data: requested, error: requestError } = await supabase.from("calendar_operations").insert({
      user_id: userId,
      connection_id: activeConnection.id,
      operation_type: "update",
      status: "pending_confirmation",
      provider_event_id: existing.provider_event_id,
      payload: { ...calendarPayload(value), timeZone: profile?.timezone || "Asia/Shanghai", previous: { subject: existing.subject, startsAt: existing.starts_at, endsAt: existing.ends_at } },
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "update", provider_event_id: existing.provider_event_id, starts_at: value.startsAt, ends_at: value.endsAt });
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: "update", confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch { return { status: "error", message: "日程未能更新到 Outlook，请检查连接后重试。" }; }
    revalidatePath("/calendar"); revalidatePath("/today");
    return { status: "success", message: "已更新并同步到 Outlook。" };
  } catch {
    return { status: "error", message: "日程未能更新，请检查连接状态或网络后重试。" };
  }
}

export async function deleteCalendarEvent(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  try {
    const { supabase, userId } = await requireOwner();
    const parsed = deleteCalendarEventSchema.safeParse(deleteFormValue(formData));
    if (!parsed.success) return { status: "error", message: "该日程信息无效，无法删除。" };
    const { data: existing, error: existingError } = await supabase.from("calendar_events")
      .select("provider_event_id,subject,starts_at,ends_at,is_all_day").eq("provider_event_id", parsed.data.providerEventId)
      .eq("subject", parsed.data.subject).eq("starts_at", parsed.data.startsAt).eq("ends_at", parsed.data.endsAt).eq("is_all_day", parsed.data.isAllDay).is("archived_at", null).maybeSingle();
    if (existingError || !existing) return { status: "error", message: "该日程已变更或不存在。请先刷新日历。" };
    const activeConnection = await connection(supabase);
    const { data: requested, error: requestError } = await supabase.from("calendar_operations").insert({
      user_id: userId,
      connection_id: activeConnection.id,
      operation_type: "delete",
      status: "pending_confirmation",
      provider_event_id: existing.provider_event_id,
      payload: { subject: existing.subject, startsAt: existing.starts_at, endsAt: existing.ends_at, isAllDay: existing.is_all_day },
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "delete", provider_event_id: existing.provider_event_id, subject: existing.subject });
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: queued.operation_type, confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch { return { status: "error", message: "日程未能从 Outlook 删除。请检查连接后重试。" }; }
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { status: "success", message: "已从 Outlook 删除这条日程。" };
  } catch {
    return { status: "error", message: "日程未能删除。请检查连接状态或网络后重试。" };
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

export async function syncAndBackupMicrosoftAction() {
  const { supabase, userId } = await requireOwner();
  const activeConnection = await connection(supabase);
  try {
    const result = await syncAndBackupMicrosoftWorkspace(activeConnection.id, userId, "manual");
    revalidatePath("/calendar");
    revalidatePath("/tasks");
    return { calendarEventCount: result.calendarEventCount, todoTaskCount: result.todoTaskCount };
  } catch {
    throw new Error("同步或备份未能完成。请检查 Outlook 连接和数据库 migration 后重试。");
  }
}
