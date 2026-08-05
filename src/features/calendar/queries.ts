import { requireOwner } from "@/lib/auth/require-owner";

export async function getCalendarWorkspace() {
  const { supabase } = await requireOwner();
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const [connection, events, operations] = await Promise.all([
    supabase.from("calendar_connections").select("id,label,status,last_seen_at,last_sync_at,last_error_code,oauth_connected_at").is("archived_at", null).maybeSingle(),
    supabase.from("calendar_events").select("id,provider_event_id,subject,starts_at,ends_at,is_all_day,location_name,last_synced_at").gte("ends_at", now).lte("starts_at", end).is("archived_at", null).order("starts_at").limit(100),
    supabase.from("calendar_operations").select("id,operation_type,status,payload,requested_at,confirmed_at,completed_at,error_code").is("archived_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  return { connection: connection.data, events: events.data ?? [], operations: operations.data ?? [], unavailable: Boolean(connection.error || events.error || operations.error) };
}
