import "server-only";

import { syncMicrosoftCalendar, syncMicrosoftTodo, syncOutlookMasterCategories } from "@/lib/adapters/microsoft-graph/calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarSyncOptions } from "@/features/calendar/sync-policy";

export type MicrosoftSyncTrigger = "manual" | "scheduled";

/**
 * Synchronizes sequentially because Microsoft may rotate a refresh token on
 * each refresh. It then stores an immutable, user-owned Supabase snapshot.
 */
export async function syncAndBackupMicrosoftWorkspace(connectionId: string, userId: string, trigger: MicrosoftSyncTrigger) {
  // Manual sync doubles as a safe, authoritative cache repair. It never
  // touches Outlook event times; it only rebuilds the local mirror through
  // the corrected Graph DateTimeTimeZone parser.
  const calendarEventCount = await syncMicrosoftCalendar(
    connectionId,
    userId,
    calendarSyncOptions(trigger),
  );
  const categories = await syncOutlookMasterCategories(connectionId, userId);
  const todo = await syncMicrosoftTodo(connectionId, userId);
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

  const { error: auditError } = await admin.from("audit_logs").insert({
    user_id: userId,
    action: "sync_backup",
    entity_type: "microsoft_sync_backup",
    entity_id: backup.id,
    actor_type: trigger === "manual" ? "user" : "system",
    after_data: { trigger, calendar_event_count: calendarEventCount, calendar_category_count: categories.count, calendar_category_status: categories.status, todo_list_count: todo.listCount, todo_task_count: todo.taskCount },
  });
  if (auditError) throw new Error("backup_audit_failed");
  return { backupId: backup.id, calendarEventCount, calendarCategoryCount: categories.count, calendarCategoryStatus: categories.status, todoListCount: todo.listCount, todoTaskCount: todo.taskCount };
}
