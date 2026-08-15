"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { accessTokenForConnection, ensureManagedOutlookCategories, executeCalendarOperation, syncOutlookMasterCategories, updateOutlookMasterCategoryColor } from "@/lib/adapters/microsoft-graph/calendar";
import type { OutlookCategoryColor } from "./classification/taxonomy";
import { classifyCalendarEvent } from "./classification/classifier";
import { categoryNamesForKeys, managedCalendarCategories } from "./classification/taxonomy";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { cancelOperationSchema, confirmOperationSchema, createCalendarEventSchema, deleteCalendarEventSchema, updateCalendarEventSchema } from "./schemas";
import { calendarPayload, calendarUpdatePayload } from "./utils";
import { markInboxProcessed } from "@/features/inbox/service";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export type CalendarCreateState = { status: "idle" | "success" | "error"; message: string };

function fail(): never { throw new Error("日历操作未能完成，请检查输入、连接状态或网络后重试。"); }
function operationFailureMessage(error: unknown, verb: "创建" | "更新" | "删除") {
  const code = error instanceof Error ? error.message : "";
  if (code === "calendar_remote_committed_cache_failed") {
    return `Outlook 已${verb}日程，本地日历正在等待重新同步；请勿重复操作。`;
  }
  if (code === "calendar_not_connected" || code === "invalid_grant")
    return "Outlook 连接已过期，请重新连接后再试。";
  if (code === "graph_access_denied")
    return "Outlook 拒绝了本次操作；请检查日历授权。";
  if (code === "graph_unavailable")
    return "Outlook 暂时不可用，尚未写入本次更改。请稍后重试。";
  if (code === "graph_invalid_request" || code === "calendar_timezone_unsupported")
    return "日程时间或时区无效，尚未写入 Outlook。请检查后重试。";
  return `日程未能${verb === "创建" ? "创建" : verb === "更新" ? "更新到 Outlook" : "从 Outlook 删除"}。请检查连接状态后重试。`;
}
function formValue(formData: FormData) {
  const categoryChoice = String(formData.get("category_choice") || "");
  const explicitMode = String(formData.get("classification_mode") || "");
  const classificationMode = explicitMode || (categoryChoice === "__none" ? "none" : categoryChoice && categoryChoice !== "__auto" ? "manual" : "auto");
  const primaryCategoryKey = String(formData.get("primary_category_key") || (categoryChoice.startsWith("__") ? "" : categoryChoice)) || null;
  return {
    subject: String(formData.get("subject") || ""),
    description: formData.has("description") ? String(formData.get("description") || "") : undefined,
    startsAt: String(formData.get("starts_at") || ""),
    endsAt: String(formData.get("ends_at") || ""),
    locationName: formData.has("location_name") ? String(formData.get("location_name") || "") : undefined,
    isAllDay: formData.has("is_all_day_present") ? formData.get("is_all_day") === "on" : formData.get("is_all_day") === "on" ? true : undefined,
    classificationMode,
    primaryCategoryKey,
    contextCategoryKeys: formData.getAll("context_category_keys").map(String),
    classificationConfidence: null,
    classificationReason: null,
    importance: formData.has("importance") ? String(formData.get("importance")) : undefined,
    showAs: formData.has("show_as") ? String(formData.get("show_as")) : undefined,
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
    preserveCategories: formData.get("preserve_categories") !== "false",
  };
}
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityId: string, afterData: Record<string, unknown>) {
  const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "calendar_operation", entity_id: entityId, after_data: afterData, actor_type: "user" });
  if (error) fail();
}
async function connection(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const { data, error } = await supabase.from("calendar_connections").select("id,status,oauth_scope_version").is("archived_at", null).maybeSingle();
  if (error || !data || data.status !== "enabled") fail();
  return data;
}

async function classificationOptions(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], scopeReady: boolean) {
  if (!scopeReady) return { enabled: false as const };
  const { data, error } = await supabase.from("calendar_categories").select("managed_key,keywords,ai_enabled").not("managed_key", "is", null).is("archived_at", null);
  return error ? { enabled: true as const } : { enabled: true as const, rules: data ?? [] };
}

export async function createCalendarEvent(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  try {
    const { supabase, userId } = await requireOwner();
    const form = formValue(formData);
    const parsed = createCalendarEventSchema.safeParse(form);
    if (!parsed.success) return { status: "error", message: "请检查日程标题和开始、结束时间。" };
    const inboxId = z.string().uuid().optional().safeParse(form.inboxId).data;
    const activeConnection = await connection(supabase);
    const categoryOptions = await classificationOptions(supabase, (activeConnection.oauth_scope_version ?? 1) >= 2);
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const { data: requested, error: requestError } = await supabase.from("calendar_operations").insert({
      user_id: userId,
      connection_id: activeConnection.id,
      operation_type: "create",
      status: "pending_confirmation",
      payload: { ...calendarPayload(parsed.data, categoryOptions), timeZone: profile?.timezone || "Asia/Shanghai" },
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "create", subject: parsed.data.subject, has_description: Boolean(parsed.data.description), starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt });

    // 点击“创建日程”即为唯一的用户确认；队列仍保留完整的状态与审计记录。
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: queued.operation_type, confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch (error) { return { status: "error", message: operationFailureMessage(error, "创建") }; }
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
      .select("provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as")
      .eq("user_id", userId)
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
      payload: { ...calendarUpdatePayload(value, { categories: existing.categories ?? [], body_text: existing.body_text, location_name: existing.location_name, is_all_day: existing.is_all_day, importance: existing.importance, show_as: existing.show_as }), timeZone: profile?.timezone || "Asia/Shanghai", previous: { subject: existing.subject, startsAt: existing.starts_at, endsAt: existing.ends_at } },
    }).select("id").single();
    if (requestError || !requested) fail();
    await audit(supabase, userId, "request", requested.id, { operation_type: "update", provider_event_id: existing.provider_event_id, starts_at: value.startsAt, ends_at: value.endsAt });
    const { data: queued, error: queueError } = await supabase.from("calendar_operations")
      .update({ status: "queued", confirmed_at: new Date().toISOString() })
      .eq("id", requested.id).eq("status", "pending_confirmation").select("id,operation_type").maybeSingle();
    if (queueError || !queued) fail();
    await audit(supabase, userId, "confirm", queued.id, { operation_type: "update", confirmation: "single_step" });
    try { await executeCalendarOperation(queued.id, userId); } catch (error) { return { status: "error", message: operationFailureMessage(error, "更新") }; }
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
      .eq("user_id", userId)
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
    try { await executeCalendarOperation(queued.id, userId); } catch (error) { return { status: "error", message: operationFailureMessage(error, "删除") }; }
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
    return { calendarEventCount: result.calendarEventCount, calendarCategoryCount: result.calendarCategoryCount, calendarCategoryStatus: result.calendarCategoryStatus, todoTaskCount: result.todoTaskCount };
  } catch {
    throw new Error("同步或备份未能完成。请检查 Outlook 连接和数据库 migration 后重试。");
  }
}

export async function initializeCalendarCategoriesAction(_previousState: CalendarCreateState): Promise<CalendarCreateState> {
  void _previousState;
  try {
    const { supabase, userId } = await requireOwner();
    const activeConnection = await connection(supabase);
    const result = await ensureManagedOutlookCategories(activeConnection.id, userId);
    revalidatePath("/calendar");
    return { status: "success", message: result.createdCount ? `已在 Outlook 新建 ${result.createdCount} 个 Personal OS 分类。` : "Outlook 分类已经齐全。" };
  } catch {
    return { status: "error", message: "无法初始化 Outlook 分类。请先重新授权 Outlook。" };
  }
}

export async function updateCalendarCategoryColorAction(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  void _previousState;
  try {
    const { supabase, userId } = await requireOwner();
    const categoryId = z.string().uuid().parse(formData.get("category_id"));
    const colorValue = String(formData.get("color") || "");
    if (!(colorValue === "None" || /^preset([0-9]|1[0-9]|2[0-4])$/.test(colorValue))) return { status: "error", message: "颜色值无效。" };
    const { data: category } = await supabase.from("calendar_categories").select("provider_category_id").eq("id", categoryId).is("archived_at", null).maybeSingle();
    if (!category?.provider_category_id) return { status: "error", message: "该分类尚未同步到 Outlook。" };
    const activeConnection = await connection(supabase);
    const accessToken = await accessTokenForConnection(activeConnection.id, userId);
    await updateOutlookMasterCategoryColor(accessToken, category.provider_category_id, colorValue as OutlookCategoryColor);
    await syncOutlookMasterCategories(activeConnection.id, userId);
    revalidatePath("/calendar");
    return { status: "success", message: "颜色已更新到 Outlook。" };
  } catch {
    return { status: "error", message: "分类颜色未能更新到 Outlook。" };
  }
}

export async function updateCalendarCategoryAiAction(_previousState: CalendarCreateState, formData: FormData): Promise<CalendarCreateState> {
  void _previousState;
  try {
    const { supabase, userId } = await requireOwner();
    const categoryId = z.string().uuid().parse(formData.get("category_id"));
    const description = z.string().trim().max(500).parse(String(formData.get("ai_description") || ""));
    const keywords = z.array(z.string().trim().min(1).max(80)).max(30).parse(String(formData.get("keywords") || "").split(/[，,\n]/).map((value) => value.trim()).filter(Boolean));
    const { data: category } = await supabase.from("calendar_categories").select("id,category_kind").eq("id", categoryId).is("archived_at", null).maybeSingle();
    if (!category || category.category_kind === "external") return { status: "error", message: "外部 Outlook 分类不由 AI 管理。" };
    const admin = createAdminClient();
    const { error } = await admin.from("calendar_categories").update({ ai_description: description || null, keywords, ai_enabled: formData.get("ai_enabled") === "on" }).eq("id", categoryId).eq("user_id", userId).is("archived_at", null);
    if (error) return { status: "error", message: "AI 分类设置未能保存。" };
    await admin.from("audit_logs").insert({ user_id: userId, action: "update_ai_settings", entity_type: "calendar_category", entity_id: categoryId, after_data: { ai_enabled: formData.get("ai_enabled") === "on", keyword_count: keywords.length }, actor_type: "user" });
    revalidatePath("/calendar");
    return { status: "success", message: "AI 分类设置已保存。" };
  } catch {
    return { status: "error", message: "请检查说明和关键词后重试。" };
  }
}

export type CalendarBackfillState = { status: "idle" | "success" | "error"; message: string };

/**
 * 为已有日程回填托管分类（纯本地，不依赖 Outlook）。
 * 1) 补齐 calendar_categories 缺失的托管分类，保证事件可按颜色渲染；
 * 2) 对尚无托管主分类的事件用真实分类器打标，保留外部分类、低置信度不打标。
 */
export async function backfillCalendarCategoriesAction(_previousState: CalendarBackfillState): Promise<CalendarBackfillState> {
  void _previousState;
  try {
    const { supabase, userId } = await requireOwner();

    const { data: existing } = await supabase
      .from("calendar_categories")
      .select("display_name")
      .eq("user_id", userId)
      .is("archived_at", null);
    const existingNames = new Set((existing ?? []).map((row) => row.display_name));
    const missing = managedCalendarCategories.filter((category) => !existingNames.has(category.displayName));
    if (missing.length) {
      const admin = createAdminClient();
      const { error } = await admin.from("calendar_categories").upsert(
        missing.map((category) => ({
          user_id: userId,
          display_name: category.displayName,
          color: category.color,
          managed_key: category.key,
          category_kind: category.kind,
          keywords: category.keywords,
          ai_description: category.aiDescription,
          is_ai_managed: true,
          ai_enabled: true,
          display_order: category.order,
        })),
        { onConflict: "user_id,display_name" },
      );
      if (error) throw error;
    }

    const rules = (await classificationOptions(supabase, true)).rules;
    const managedNames = new Set(managedCalendarCategories.map((category) => category.displayName));
    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("id,subject,body_text,location_name,categories")
      .eq("user_id", userId)
      .is("archived_at", null)
      .limit(5000);
    if (eventsError) throw eventsError;

    let updated = 0;
    let alreadyLabeled = 0;
    let lowConfidence = 0;
    for (const event of events ?? []) {
      const existingCategories: string[] = event.categories ?? [];
      const external = existingCategories.filter((name) => !managedNames.has(name));
      const hasManagedPrimary = existingCategories.some((name) => managedNames.has(name) && name.startsWith("领域·"));
      if (hasManagedPrimary) {
        alreadyLabeled += 1;
        continue;
      }
      const result = classifyCalendarEvent(
        { subject: event.subject ?? "", description: event.body_text ?? null, locationName: event.location_name ?? null },
        rules,
      );
      let next: string[];
      if (result.needsConfirmation) {
        next = external;
        lowConfidence += 1;
      } else {
        next = [...new Set([...categoryNamesForKeys(result.primaryCategoryKey, result.contextCategoryKeys), ...external])];
        updated += 1;
      }
      if (JSON.stringify(next) !== JSON.stringify(existingCategories)) {
        await supabase.from("calendar_events").update({ categories: next }).eq("id", event.id);
      }
    }

    revalidatePath("/calendar");
    const parts = [
      updated ? `已为 ${updated} 条历史日程分类` : "",
      alreadyLabeled ? `${alreadyLabeled} 条已有分类未改动` : "",
      lowConfidence ? `${lowConfidence} 条低置信度未打标` : "",
    ].filter(Boolean);
    return { status: "success", message: `分类完成：${parts.join("，")}。` };
  } catch {
    return { status: "error", message: "历史日程分类未能完成，请稍后重试。" };
  }
}
