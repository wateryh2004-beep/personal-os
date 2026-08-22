import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";

type Owner = Awaited<ReturnType<typeof requireOwner>>;

type CalendarConnectionRow = {
  id: string;
  label: string | null;
  status: string;
  last_sync_at: string | null;
  last_error_code: string | null;
  oauth_connected_at: string | null;
  granted_scopes: string[] | null;
  oauth_scope_version: number | null;
  calendar_last_delta_sync_at: string | null;
  calendar_last_full_reconcile_at: string | null;
  calendar_subscription_expires_at: string | null;
  calendar_webhook_last_received_at: string | null;
};

type CalendarCategoryRow = {
  id: string;
  provider_category_id: string | null;
  display_name: string;
  color: string | null;
  managed_key: string | null;
  category_kind: string | null;
  ai_description: string | null;
  keywords: string[] | null;
  display_order: number | null;
  is_ai_managed: boolean | null;
  ai_enabled: boolean | null;
  last_synced_at: string | null;
};

type CalendarRunningSyncRow = { id: string; started_at: string };

type CalendarWorkspaceReadModel = {
  connection: CalendarConnectionRow | null;
  categories: CalendarCategoryRow[];
  timezone: string;
  running_sync: CalendarRunningSyncRow | null;
};

function isCalendarWorkspaceReadModel(value: unknown): value is CalendarWorkspaceReadModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CalendarWorkspaceReadModel>;
  return typeof candidate.timezone === "string" && Array.isArray(candidate.categories);
}

function buildCalendarWorkspace(
  connection: CalendarConnectionRow | null | undefined,
  categories: CalendarCategoryRow[],
  timezone: string | null | undefined,
  runningSync: CalendarRunningSyncRow | null | undefined,
  unavailable = false,
) {
  const normalizedConnection = connection ?? null;
  const sync = normalizedConnection ? (() => {
    const lastSyncAt = normalizedConnection.calendar_last_delta_sync_at ?? normalizedConnection.last_sync_at;
    const nextHourlyAt = lastSyncAt ? new Date(Date.parse(lastSyncAt) + 3600_000).toISOString() : null;
    const nextFullAt = normalizedConnection.calendar_last_full_reconcile_at ? new Date(Date.parse(normalizedConnection.calendar_last_full_reconcile_at) + 172800_000).toISOString() : null;
    const ageMs = lastSyncAt ? Date.now() - Date.parse(lastSyncAt) : Number.POSITIVE_INFINITY;
    const state: "fresh" | "syncing" | "stale" | "failed" = runningSync ? "syncing" : normalizedConnection.last_error_code ? "failed" : ageMs <= 3600_000 ? "fresh" : "stale";
    const subscriptionExpiring = Boolean(normalizedConnection.calendar_subscription_expires_at && Date.parse(normalizedConnection.calendar_subscription_expires_at) - Date.now() < 24 * 3600_000);
    return {
      state,
      lastSyncAt,
      nextHourlyAt,
      nextFullAt,
      subscriptionExpiresAt: normalizedConnection.calendar_subscription_expires_at,
      webhookLastReceivedAt: normalizedConnection.calendar_webhook_last_received_at,
      errorCode: normalizedConnection.last_error_code,
      subscriptionExpiring,
    };
  })() : null;
  return {
    connection: normalizedConnection,
    sync,
    events: [],
    categories,
    timezone: timezone || "Asia/Shanghai",
    unavailable,
  };
}

async function getCalendarWorkspaceLegacy(owner: Owner) {
  const { supabase, userId } = owner;
  const [connection, categories, profile, runningSync] = await Promise.all([
    withPerfSpan("calendar.workspace.connection", () => supabase.from("calendar_connections").select("id,label,status,last_sync_at,last_error_code,oauth_connected_at,granted_scopes,oauth_scope_version,calendar_last_delta_sync_at,calendar_last_full_reconcile_at,calendar_subscription_expires_at,calendar_webhook_last_received_at").is("archived_at", null).maybeSingle()),
    withPerfSpan("calendar.workspace.categories", () => supabase.from("calendar_categories").select("id,provider_category_id,display_name,color,managed_key,category_kind,ai_description,keywords,display_order,is_ai_managed,ai_enabled,last_synced_at").is("archived_at", null).order("display_order").order("display_name")),
    withPerfSpan("calendar.workspace.profile", () => supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle()),
    withPerfSpan("calendar.workspace.running-sync", () => supabase.from("calendar_sync_runs").select("id,started_at").eq("user_id", userId).eq("status", "running").is("archived_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle()),
  ]);
  return buildCalendarWorkspace(
    connection.data as CalendarConnectionRow | null,
    (categories.data ?? []) as CalendarCategoryRow[],
    profile.data?.timezone,
    runningSync.data as CalendarRunningSyncRow | null,
    Boolean(connection.error || categories.error),
  );
}

export async function getCalendarWorkspace(owner?: Owner) {
  const resolvedOwner = owner ?? await withPerfSpan("calendar.workspace.auth", () => requireOwner());
  const { supabase } = resolvedOwner;

  const compact = await withPerfSpan("calendar.workspace.read-model", () =>
    supabase.rpc("get_calendar_workspace_read_model"),
  );
  if (!compact.error && isCalendarWorkspaceReadModel(compact.data)) {
    return buildCalendarWorkspace(
      compact.data.connection,
      compact.data.categories,
      compact.data.timezone,
      compact.data.running_sync,
    );
  }

  return getCalendarWorkspaceLegacy(resolvedOwner);
}
