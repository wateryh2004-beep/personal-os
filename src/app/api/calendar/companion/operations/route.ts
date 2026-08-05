import { NextRequest } from "next/server";
import { bridgeAuthorized, bridgeConnection, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!bridgeAuthorized(request)) return unauthorized();
  let bridge;
  try { bridge = await bridgeConnection(request); } catch { return Response.json({ error: "Calendar bridge is not configured." }, { status: 503 }); }
  if (!bridge) return unauthorized();
  const { supabase, connection } = bridge;
  await supabase.from("calendar_connections").update({ last_seen_at: new Date().toISOString(), last_error_code: null }).eq("id", connection.id);
  const { data: candidate } = await supabase.from("calendar_operations").select("id,operation_type,provider_event_id,calendar_id,payload").eq("connection_id", connection.id).eq("status", "queued").is("archived_at", null).order("requested_at").limit(1).maybeSingle();
  if (!candidate) return Response.json({ operation: null });
  const { data: operation, error } = await supabase.from("calendar_operations").update({ status: "processing", claimed_at: new Date().toISOString() }).eq("id", candidate.id).eq("status", "queued").select("id,operation_type,provider_event_id,calendar_id,payload").maybeSingle();
  if (error) return Response.json({ error: "Unable to claim operation." }, { status: 500 });
  return Response.json({ operation: operation ?? null });
}
