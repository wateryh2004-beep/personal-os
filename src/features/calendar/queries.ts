import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";

type Owner = Awaited<ReturnType<typeof requireOwner>>;

export async function getCalendarWorkspace(owner?: Owner) {
  const { supabase, userId } = owner ?? await withPerfSpan("calendar.workspace.auth", () => requireOwner());
  const [connection, categories, profile, runningSync] = await Promise.all([
    withPerfSpan("calendar.workspace.connection", () => supabase.from("calendar_connections").select("id,label,status,last_sync_at,last_error_code,oauth_connected_at,granted_scopes,oauth_scope_version,calendar_last_delta_sync_at,calendar_last_full_reconcile_at,calendar_subscription_expires_at,calendar_webhook_last_received_at").is("archived_at", null).maybeSingle()),
    withPerfSpan("calendar.workspace.categories", () => supabase.from("calendar_categories").select("id,provider_category_id,display_name,color,managed_key,category_kind,ai_description,keywords,display_order,is_ai_managed,ai_enabled,last_synced_at").is("archived_at", null).order("display_order").order("display_name")),
    withPerfSpan("calendar.workspace.profile", () => supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle()),
    withPerfSpan("calendar.workspace.running-sync", () => supabase.from("calendar_sync_runs").select("id,started_at").eq("user_id", userId).eq("status", "running").is("archived_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle()),
  ]);
  const sync = connection.data ? (() => {
    const lastSyncAt = connection.data.calendar_last_delta_sync_at ?? connection.data.last_sync_at;
    const nextHourlyAt = lastSyncAt ? new Date(Date.parse(lastSyncAt) + 3600_000).toISOString() : null;
    const nextFullAt = connection.data.calendar_last_full_reconcile_at ? new Date(Date.parse(connection.data.calendar_last_full_reconcile_at) + 172800_000).toISOString() : null;
    const ageMs = lastSyncAt ? Date.now() - Date.parse(lastSyncAt) : Number.POSITIVE_INFINITY;
    const state = runningSync.data ? "syncing" : connection.data.last_error_code ? "failed" : ageMs <= 3600_000 ? "fresh" : "stale";
    const subscriptionExpiring = Boolean(connection.data.calendar_subscription_expires_at && Date.parse(connection.data.calendar_subscription_expires_at) - Date.now() < 24 * 3600_000);
    return { state, lastSyncAt, nextHourlyAt, nextFullAt, subscriptionExpiresAt: connection.data.calendar_subscription_expires_at, webhookLastReceivedAt: connection.data.calendar_webhook_last_received_at, errorCode: connection.data.last_error_code, subscriptionExpiring };
  })() : null;
  return { connection: connection.data, sync, events: [], categories: categories.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", unavailable: Boolean(connection.error || categories.error) };
}
