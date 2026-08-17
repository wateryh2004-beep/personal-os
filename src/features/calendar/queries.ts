import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";

type Owner = Awaited<ReturnType<typeof requireOwner>>;

export async function getCalendarWorkspace(owner?: Owner) {
  const { supabase, userId } = owner ?? await withPerfSpan("calendar.workspace.auth", () => requireOwner());
  const [connection, categories, profile] = await Promise.all([
    withPerfSpan("calendar.workspace.connection", () => supabase.from("calendar_connections").select("id,label,status,last_seen_at,last_sync_at,last_error_code,oauth_connected_at,granted_scopes,oauth_scope_version").is("archived_at", null).maybeSingle()),
    withPerfSpan("calendar.workspace.categories", () => supabase.from("calendar_categories").select("id,provider_category_id,display_name,color,managed_key,category_kind,ai_description,keywords,display_order,is_ai_managed,ai_enabled,last_synced_at").is("archived_at", null).order("display_order").order("display_name")),
    withPerfSpan("calendar.workspace.profile", () => supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle()),
  ]);
  return { connection: connection.data, events: [], categories: categories.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", unavailable: Boolean(connection.error || categories.error) };
}
