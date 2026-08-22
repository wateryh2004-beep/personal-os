import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptMicrosoftRefreshToken } from "@/lib/adapters/microsoft-graph/calendar";
import { drainCalendarSyncQueue, enqueueCalendarSync } from "@/lib/services/calendar-near-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Notification = { subscriptionId?: string; clientState?: string; lifecycleEvent?: string };

// Microsoft Graph validates this public endpoint with a plain-text token.
export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  const payload = await request.json().catch(() => null) as { value?: Notification[] } | null;
  const notifications = payload?.value ?? [];
  if (!notifications.length) return NextResponse.json({ error: "invalid_notification" }, { status: 400 });
  const admin = createAdminClient();
  let accepted = 0;
  for (const notification of notifications) {
    if (!notification.subscriptionId || !notification.clientState) continue;
    const { data: connection } = await admin.from("calendar_connections")
      .select("id,user_id,calendar_webhook_state_ciphertext")
      .eq("calendar_subscription_id", notification.subscriptionId).eq("status", "enabled").is("archived_at", null).maybeSingle();
    if (!connection?.calendar_webhook_state_ciphertext) continue;
    let expected = ""; try { expected = decryptMicrosoftRefreshToken(connection.calendar_webhook_state_ciphertext); } catch { continue; }
    if (expected !== notification.clientState) continue;
    const lifecycleFailure = notification.lifecycleEvent === "subscriptionRemoved" || notification.lifecycleEvent === "reauthorizationRequired";
    await admin.from("calendar_connections").update({
      calendar_webhook_last_received_at: new Date().toISOString(),
      ...(lifecycleFailure ? { calendar_subscription_id: null, calendar_subscription_expires_at: null, last_error_code: notification.lifecycleEvent === "reauthorizationRequired" ? "calendar_reauthorization_required" : "calendar_subscription_removed" } : {}),
    }).eq("id", connection.id);
    // Notification payloads are deliberately discarded. They only wake a
    // server-side delta pull after a short debounce window.
    await enqueueCalendarSync(connection.id, connection.user_id, notification.lifecycleEvent ? "recovery" : "webhook", 0);
    accepted += 1;
  }
  if (accepted) after(() => drainCalendarSyncQueue().catch(() => {}));
  return NextResponse.json({ accepted }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
