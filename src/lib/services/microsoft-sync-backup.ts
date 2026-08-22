import "server-only";

import { MicrosoftGraphError, syncMicrosoftCalendar, syncMicrosoftTodo, syncOutlookMasterCategories } from "@/lib/adapters/microsoft-graph/calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyUnlabeledCalendarEvents } from "@/features/calendar/classification/backfill";
import { completeCalendarSyncRun, startCalendarSyncRun } from "@/lib/services/calendar-near-sync";

export type MicrosoftSyncTrigger = "manual" | "scheduled";

function stageErrorCode(error: unknown) {
  return error instanceof MicrosoftGraphError ? error.code : error instanceof Error ? error.message : "unknown";
}

/**
 * Synchronizes sequentially because Microsoft may rotate a refresh token on
 * each refresh. It then stores an immutable, user-owned Supabase snapshot.
 *
 * The calendar mirror is the primary deliverable and its failure is fatal.
 * The auxiliary stages (Outlook categories, classification, To Do, and the
 * backup snapshot) are best-effort: a failure there must not hide an otherwise
 * correct calendar sync, so each is isolated and reported in `degraded` — the
 * caller can surface it without aborting the sync.
 */
export async function syncAndBackupMicrosoftWorkspace(connectionId: string, userId: string, trigger: MicrosoftSyncTrigger) {
  const run = await startCalendarSyncRun(userId, connectionId, trigger, "full_reconcile");
  if (!run) return { backupId: null, calendarEventCount: 0, calendarCategoryCount: 0, calendarCategoryStatus: "reauthorization_required" as const, todoListCount: 0, todoTaskCount: 0, degraded: ["calendar_sync_in_progress"], skipped: true };
  try {
  // Sync always performs a full, authoritative Graph read: it never touches
  // Outlook event times; it only rebuilds the local mirror through the
  // corrected Graph DateTimeTimeZone parser and the non-delta calendarView
  // (delta trims recurring-occurrence fields).
  const calendarEventCount = await syncMicrosoftCalendar(connectionId, userId);

  const degraded: string[] = [];
  let categories: { status: "ok" | "reauthorization_required"; count: number } = { status: "reauthorization_required", count: 0 };
  try {
    categories = await syncOutlookMasterCategories(connectionId, userId);
  } catch (error) {
    degraded.push(`categories:${stageErrorCode(error)}`);
  }

  // 手动同步是用户主动触发的全量重建；Outlook 上无分类的日程 Graph 返回 []，
  // 若不补分类，历史日程会一直保持灰色无分类。手动后自动跑一遍分类器，
  // 保证「同步一次、分类还在」；定时增量同步不重复扫，避免无谓写库。
  // 放在 syncOutlookMasterCategories 之后，避免刚补上的托管分类行被其归档。
  if (trigger === "manual") {
    try {
      await classifyUnlabeledCalendarEvents(userId);
    } catch (error) {
      degraded.push(`classify:${stageErrorCode(error)}`);
    }
  }

  let todo = { listCount: 0, taskCount: 0 };
  try {
    todo = await syncMicrosoftTodo(connectionId, userId);
  } catch (error) {
    degraded.push(`todo:${stageErrorCode(error)}`);
  }

  let backupId: string | null = null;
  try {
    const admin = createAdminClient();
    const [eventsResult, categoriesResult, listsResult, tasksResult] = await Promise.all([
      admin.from("calendar_events").select("provider_event_id,calendar_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as,provider_change_key,last_synced_at,archived_at").eq("user_id", userId).order("starts_at"),
      admin.from("calendar_categories").select("provider_category_id,display_name,color,managed_key,category_kind,ai_description,keywords,ai_enabled,last_synced_at,archived_at").eq("user_id", userId).order("display_order"),
      admin.from("microsoft_todo_lists").select("provider_list_id,display_name,is_default,last_synced_at,archived_at").eq("user_id", userId).order("display_name"),
      admin.from("microsoft_todo_tasks").select("provider_task_id,title,body_text,status,importance,due_at,completed_at,provider_last_modified_at,last_synced_at,archived_at").eq("user_id", userId).order("created_at"),
    ]);
    if (eventsResult.error || categoriesResult.error || listsResult.error || tasksResult.error) throw new Error("backup_read_failed");

    const capturedAt = new Date().toISOString();
    const snapshot = {
      format_version: 2,
      captured_at: capturedAt,
      calendar_events: eventsResult.data ?? [],
      calendar_categories: categoriesResult.data ?? [],
      todo_lists: listsResult.data ?? [],
      todo_tasks: tasksResult.data ?? [],
    };
    const { data: backup, error: backupError } = await admin.from("microsoft_sync_backups").insert({
      user_id: userId,
      connection_id: connectionId,
      trigger_source: trigger,
      snapshot,
      calendar_event_count: snapshot.calendar_events.length,
      todo_list_count: snapshot.todo_lists.length,
      todo_task_count: snapshot.todo_tasks.length,
    }).select("id").single();
    if (backupError || !backup) throw new Error("backup_write_failed");
    backupId = backup.id;

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: userId,
      action: "sync_backup",
      entity_type: "microsoft_sync_backup",
      entity_id: backup.id,
      actor_type: trigger === "manual" ? "user" : "system",
      after_data: { trigger, calendar_event_count: calendarEventCount, calendar_category_count: categories.count, calendar_category_status: categories.status, todo_list_count: todo.listCount, todo_task_count: todo.taskCount, degraded },
    });
    if (auditError) degraded.push(`audit:${String(auditError.code ?? auditError.message)}`);
  } catch (error) {
    degraded.push(`backup:${stageErrorCode(error)}`);
  }

  await completeCalendarSyncRun(run.id, { status: "succeeded", eventCount: calendarEventCount, changedCount: calendarEventCount, nextScheduledAt: new Date(Date.now() + 172800000).toISOString(), started: run.started });
  return { backupId, calendarEventCount, calendarCategoryCount: categories.count, calendarCategoryStatus: categories.status, todoListCount: todo.listCount, todoTaskCount: todo.taskCount, degraded };
  } catch (error) {
    await completeCalendarSyncRun(run.id, { status: "failed", errorCode: stageErrorCode(error), started: run.started });
    throw error;
  }
}
