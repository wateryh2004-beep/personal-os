import { requireOwner } from "@/lib/auth/require-owner";

export async function getCalendarWorkspace() {
  const { supabase, userId } = await requireOwner();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();
  const [connection, events, categories, profile] = await Promise.all([
    supabase.from("calendar_connections").select("id,label,status,last_seen_at,last_sync_at,last_error_code,oauth_connected_at,granted_scopes,oauth_scope_version").is("archived_at", null).maybeSingle(),
    supabase.from("calendar_events").select("id,provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as,last_synced_at").gte("ends_at", start).lte("starts_at", end).is("archived_at", null).order("starts_at").limit(500),
    supabase.from("calendar_categories").select("id,provider_category_id,display_name,color,managed_key,category_kind,ai_description,keywords,display_order,is_ai_managed,ai_enabled,last_synced_at").is("archived_at", null).order("display_order").order("display_name"),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  return { connection: connection.data, events: events.data ?? [], categories: categories.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", unavailable: Boolean(connection.error || events.error || categories.error) };
}
