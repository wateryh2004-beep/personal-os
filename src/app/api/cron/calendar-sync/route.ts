import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainCalendarSyncQueue, syncNearCalendar } from "@/lib/services/calendar-near-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly endpoint for Vercel Pro or any external scheduler. Hobby plans can
 * keep the daily Vercel cron and invoke this endpoint externally with CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const admin = createAdminClient(); const started = new Date();
  const { data: cronRun } = await admin.from("calendar_sync_cron_runs").insert({ trigger_source: "external_scheduler", started_at: started.toISOString() }).select("id").maybeSingle();
  const { data: connections, error } = await admin.from("calendar_connections").select("id,user_id").eq("status", "enabled").is("archived_at", null);
  if (error) {
    if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), failed_count: 1, duration_ms: Date.now() - started.getTime(), error_code: "connection_lookup_failed" }).eq("id", cronRun.id);
    return NextResponse.json({ error: "connection_lookup_failed" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
  const queueStartedAt = Date.now();
  const queued = await drainCalendarSyncQueue().catch(() => ({ processed: 0, failed: 1 }));
  const queueDurationMs = Date.now() - queueStartedAt;
  const deltaStartedAt = Date.now();
  const results = await Promise.allSettled((connections ?? []).map(async (connection) => {
    const result = await syncNearCalendar(connection.id, connection.user_id, "external_scheduler");
    // Polling needs only the existing calendar read grant; subscription
    // provisioning and renewal remain separate from this dependable fallback.
    return result;
  }));
  const deltaDurationMs = Date.now() - deltaStartedAt;
  const failed = queued.failed + results.filter((result) => result.status === "rejected").length;
  if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), connection_count: (connections ?? []).length, succeeded_count: results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length, failed_count: failed, duration_ms: Date.now() - started.getTime(), stage_durations_ms: { queue: queueDurationMs, near_delta: deltaDurationMs }, next_scheduled_at: new Date(Date.now() + 3600000).toISOString(), error_code: failed ? "partial_failure" : null }).eq("id", cronRun.id);
  return NextResponse.json({ processed: results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length, skipped: results.filter((result) => result.status === "fulfilled" && result.value.skipped).length, queuedProcessed: queued.processed, failed }, { status: failed ? 207 : 200, headers: { "Cache-Control": "private, no-store" } });
}
