import { NextRequest } from "next/server";
import { companionResultSchema, companionSyncSchema } from "@/features/calendar/schemas";
import { bridgeAuthorized, bridgeConnection, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!bridgeAuthorized(request)) return unauthorized();
  let bridge;
  try { bridge = await bridgeConnection(request); } catch { return Response.json({ error: "Calendar bridge is not configured." }, { status: 503 }); }
  if (!bridge) return unauthorized();
  const body = await request.json().catch(() => null);
  const result = companionResultSchema.safeParse(body);
  if (!result.success) return Response.json({ error: "Invalid result." }, { status: 400 });
  const { supabase, connection } = bridge;
  const { data: operation, error } = await supabase.from("calendar_operations").select("id,user_id,operation_type").eq("id", result.data.operationId).eq("connection_id", connection.id).eq("status", "processing").maybeSingle();
  if (error || !operation) return Response.json({ error: "Operation is not active." }, { status: 409 });
  const completedAt = new Date().toISOString();
  if (result.data.outcome === "succeeded" && result.data.event) {
    const event = result.data.event;
    if (event.deleted) {
      await supabase.from("calendar_events").update({ archived_at: completedAt, last_synced_at: completedAt }).eq("user_id", operation.user_id).eq("provider_event_id", event.providerEventId);
    } else {
      const { error: eventError } = await supabase.from("calendar_events").upsert({ user_id: operation.user_id, provider_event_id: event.providerEventId, calendar_id: event.calendarId ?? null, subject: event.subject, starts_at: event.startsAt, ends_at: event.endsAt, is_all_day: event.isAllDay, location_name: event.locationName ?? null, provider_change_key: event.providerChangeKey ?? null, last_synced_at: completedAt, archived_at: null }, { onConflict: "user_id,provider_event_id" });
      if (eventError) return Response.json({ error: "Unable to save event cache." }, { status: 500 });
    }
  }
  const { error: completionError } = await supabase.from("calendar_operations").update({ status: result.data.outcome, completed_at: completedAt, error_code: result.data.outcome === "failed" ? result.data.errorCode || "companion_failed" : null, result: result.data.event ?? {} }).eq("id", operation.id).eq("status", "processing");
  if (completionError) return Response.json({ error: "Unable to finish operation." }, { status: 500 });
  await supabase.from("audit_logs").insert({ user_id: operation.user_id, action: result.data.outcome, entity_type: "calendar_operation", entity_id: operation.id, after_data: { operation_type: operation.operation_type, source: "calendar_companion" }, actor_type: "calendar_companion" });
  return Response.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  if (!bridgeAuthorized(request)) return unauthorized();
  let bridge;
  try { bridge = await bridgeConnection(request); } catch { return Response.json({ error: "Calendar bridge is not configured." }, { status: 503 }); }
  if (!bridge) return unauthorized();
  const parsed = companionSyncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid calendar snapshot." }, { status: 400 });
  const { supabase, connection } = bridge;
  const now = new Date().toISOString();
  const rows = parsed.data.events.filter((event) => !event.deleted).map((event) => ({ user_id: connection.user_id, provider_event_id: event.providerEventId, calendar_id: event.calendarId ?? null, subject: event.subject, starts_at: event.startsAt, ends_at: event.endsAt, is_all_day: event.isAllDay, location_name: event.locationName ?? null, provider_change_key: event.providerChangeKey ?? null, last_synced_at: now, archived_at: null }));
  if (rows.length) { const { error } = await supabase.from("calendar_events").upsert(rows, { onConflict: "user_id,provider_event_id" }); if (error) return Response.json({ error: "Unable to save calendar snapshot." }, { status: 500 }); }
  await supabase.from("calendar_connections").update({ last_seen_at: now, last_sync_at: now, last_error_code: null }).eq("id", connection.id);
  return Response.json({ ok: true, count: rows.length });
}
