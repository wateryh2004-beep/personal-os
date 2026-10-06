import { NextRequest, NextResponse } from "next/server";
import { cronAuthDiagnostics } from "@/features/calendar/cron-auth-diagnostics";
import { nextDailyCalendarSync } from "@/features/calendar/scheduler-status";
import { env } from "@/lib/env";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainCalendarSyncQueue, syncNearCalendar } from "@/lib/services/calendar-near-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    console.warn(JSON.stringify({ type: "calendar_cron_auth_rejected", ...cronAuthDiagnostics(env.cronSecret, request.headers.get("authorization")) }));
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const admin = createAdminClient(); const startedAt = new Date();
  const { data: cronRun } = await admin.from("calendar_sync_cron_runs").insert({ trigger_source: "scheduled", started_at: startedAt.toISOString() }).select("id").maybeSingle();
  const { data: connections, error } = await admin.from("calendar_connections")
    .select("id,user_id").eq("status", "enabled").is("archived_at", null);
  if (error) { if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), error_code: "connection_lookup_failed", failed_count: 1 }).eq("id", cronRun.id); return NextResponse.json({ error: "connection_lookup_failed" }, { status: 500, headers: { "Cache-Control": "private, no-store" } }); }

  const queueStartedAt = Date.now();
  const queued = await drainCalendarSyncQueue().catch(() => ({ processed: 0, failed: 1 }));
  const queueDurationMs = Date.now() - queueStartedAt;
  // A deep reconciliation runs no more than once every 48 hours. It remains
  // the repair path for missed notifications and invalid delta cursors.
  const reconcileStartedAt = Date.now();
  const results = await Promise.allSettled((connections ?? []).map(async (connection) => {
    const { data, error: lookupError } = await admin.from("calendar_connections").select("calendar_last_full_reconcile_at").eq("id", connection.id).eq("user_id", connection.user_id).maybeSingle();
    if (lookupError) throw new Error("connection_lookup_failed");
    const fullDue = !data?.calendar_last_full_reconcile_at || Date.now() - Date.parse(data.calendar_last_full_reconcile_at) >= 172800000;
    // The Hobby-compatible daily job must still refresh the working calendar
    // on days when deep reconciliation is not due.
    if (!fullDue) return syncNearCalendar(connection.id, connection.user_id, "scheduled");
    const result = await syncAndBackupMicrosoftWorkspace(connection.id, connection.user_id, "scheduled");
    if (result.skipped) return result;
    const { error: checkpointError } = await admin.from("calendar_connections").update({ calendar_last_full_reconcile_at: new Date().toISOString() }).eq("id", connection.id).eq("user_id", connection.user_id);
    if (checkpointError) throw new Error("calendar_checkpoint_failed");
    // Daily polling is read-only in Outlook and does not provision webhook access.
    return result;
  }));
  const reconcileDurationMs = Date.now() - reconcileStartedAt;
  const failed = results.filter((result) => result.status === "rejected").length + queued.failed;
  const nextScheduledAt = nextDailyCalendarSync();
  if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), connection_count: (connections ?? []).length, succeeded_count: results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length, failed_count: failed, duration_ms: Date.now() - startedAt.getTime(), stage_durations_ms: { queue: queueDurationMs, full_reconcile: reconcileDurationMs }, next_scheduled_at: nextScheduledAt, error_code: failed ? "partial_failure" : null }).eq("id", cronRun.id);
  return NextResponse.json({ processed: results.length, queuedProcessed: queued.processed, failed, nextScheduledAt }, { status: failed ? 207 : 200, headers: { "Cache-Control": "private, no-store" } });
}
