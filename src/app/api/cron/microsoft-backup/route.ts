import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAndBackupMicrosoftWorkspace } from "@/lib/services/microsoft-sync-backup";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const admin = createAdminClient();
  const { data: connections, error } = await admin.from("calendar_connections")
    .select("id,user_id").eq("status", "enabled").is("archived_at", null);
  if (error) return NextResponse.json({ error: "connection_lookup_failed" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });

  const results = await Promise.allSettled((connections ?? []).map((connection) => syncAndBackupMicrosoftWorkspace(connection.id, connection.user_id, "scheduled")));
  const failed = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ processed: results.length, failed }, { status: failed ? 207 : 200, headers: { "Cache-Control": "private, no-store" } });
}
