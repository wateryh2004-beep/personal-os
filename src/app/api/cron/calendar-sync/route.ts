import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainCalendarSyncQueue, syncNearCalendar } from "@/lib/services/calendar-near-sync";
import { ensureCalendarWebhookSubscription } from "@/lib/adapters/microsoft-graph/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Hourly endpoint for Vercel Pro or any external scheduler. Hobby plans can
 * keep the daily Vercel cron and invoke this endpoint externally with CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const admin = createAdminClient(); const started = new Date();
  const { data: cronRun } = await admin.from("calendar_sync_cron_runs").insert({ trigger_source: "external_scheduler", started_at: started.toISOString() }).select("id").maybeSingle();
  const { data: connections, error } = await admin.from("calendar_connections").select("id,user_id").eq("status", "enabled").is("archived_at", null);
  if (error) return NextResponse.json({ error: "connection_lookup_failed" }, { status: 500 });
  const queued = await drainCalendarSyncQueue().catch(() => ({ processed: 0, failed: 1 }));
  const results = await Promise.allSettled((connections ?? []).map(async (connection) => {
    const result = await syncNearCalendar(connection.id, connection.user_id, "external_scheduler");
    if (env.appUrl) await ensureCalendarWebhookSubscription(connection.id, connection.user_id, `${env.appUrl}/api/webhooks/microsoft/calendar`);
    return result;
  }));
  const failed = queued.failed + results.filter((result) => result.status === "rejected").length;
  if (cronRun) await admin.from("calendar_sync_cron_runs").update({ completed_at: new Date().toISOString(), connection_count: (connections ?? []).length, succeeded_count: Math.max(0, results.length - failed), failed_count: failed, duration_ms: Date.now() - started.getTime(), next_scheduled_at: new Date(Date.now() + 3600000).toISOString(), error_code: failed ? "partial_failure" : null }).eq("id", cronRun.id);
  return NextResponse.json({ processed: results.length, queuedProcessed: queued.processed, failed }, { status: failed ? 207 : 200, headers: { "Cache-Control": "private, no-store" } });
}
