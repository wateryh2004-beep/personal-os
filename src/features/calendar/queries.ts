import { requireOwner } from "@/lib/auth/require-owner";

export async function getCalendarWorkspace() {
  const { supabase } = await requireOwner();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();
  const [connection, events] = await Promise.all([
    supabase.from("calendar_connections").select("id,label,status,last_seen_at,last_sync_at,last_error_code,oauth_connected_at").is("archived_at", null).maybeSingle(),
    supabase.from("calendar_events").select("id,provider_event_id,subject,starts_at,ends_at,is_all_day,location_name,last_synced_at").gte("ends_at", start).lte("starts_at", end).is("archived_at", null).order("starts_at").limit(500),
  ]);
  return { connection: connection.data, events: events.data ?? [], unavailable: Boolean(connection.error || events.error) };
}
