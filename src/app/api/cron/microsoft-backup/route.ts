import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainCalendarSyncQueue } from "@/lib/services/calendar-near-sync";
import { ensureCalendarWebhookSubscription } from "@/lib/adapters/microsoft-graph/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const admin = createAdminClient(); const startedAt = new Date();
  const { data: cronRun } = await admin.from("calendar_sync_cron_runs").insert({ trigger_source: "scheduled", started_at: startedAt.toISOString() }).select("id").maybeSingle();
  const { data: connections, error } = await admin.from("calendar_connections")
    .select("id,user_id").eq("status", "enabled").is("archived_at", null);
  if (error) { if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), error_code: "connection_lookup_failed", failed_count: 1 }).eq("id", cronRun.id); return NextResponse.json({ error: "connection_lookup_failed" }, { status: 500, headers: { "Cache-Control": "private, no-store" } }); }

  const queued = await drainCalendarSyncQueue().catch(() => ({ processed: 0, failed: 1 }));
  // A deep reconciliation runs no more than once every 48 hours. It remains
  // the repair path for missed notifications and invalid delta cursors.
  const eligible = await Promise.all((connections ?? []).map(async (connection) => {
    const { data } = await admin.from("calendar_connections").select("calendar_last_full_reconcile_at").eq("id", connection.id).maybeSingle();
    return !data?.calendar_last_full_reconcile_at || Date.now() - Date.parse(data.calendar_last_full_reconcile_at) >= 172800000 ? connection : null;
  }));
  const results = await Promise.allSettled(eligible.filter((connection): connection is NonNullable<typeof connection> => Boolean(connection)).map(async (connection) => {
    const result = await syncAndBackupMicrosoftWorkspace(connection.id, connection.user_id, "scheduled");
    await admin.from("calendar_connections").update({ calendar_last_full_reconcile_at: new Date().toISOString() }).eq("id", connection.id);
    if (env.appUrl) await ensureCalendarWebhookSubscription(connection.id, connection.user_id, `${env.appUrl}/api/webhooks/microsoft/calendar`);
    return result;
  }));
  const failed = results.filter((result) => result.status === "rejected").length + queued.failed;
  const nextScheduledAt = new Date(Date.now() + 86400000).toISOString();
  if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), connection_count: (connections ?? []).length, succeeded_count: Math.max(0, results.length - failed), failed_count: failed, duration_ms: Date.now() - startedAt.getTime(), next_scheduled_at: nextScheduledAt, error_code: failed ? "partial_failure" : null }).eq("id", cronRun.id);
  return NextResponse.json({ processed: results.length, queuedProcessed: queued.processed, failed, nextScheduledAt }, { status: failed ? 207 : 200, headers: { "Cache-Control": "private, no-store" } });
}
