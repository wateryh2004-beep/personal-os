import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenForConnection, existingCalendarEvents, graph, graphEventRecord, MicrosoftGraphError, type GraphEvent } from "@/lib/adapters/microsoft-graph/calendar";
import { recordStatusSafely } from "@/features/system-status/service";

export type CalendarSyncTrigger = "manual" | "scheduled" | "external_scheduler" | "webhook" | "recovery";
export type CalendarSyncMode = "near_delta" | "near_full" | "full_reconcile" | "subscription_renewal";
type Settings = { nearHistoryDays: number; nearForwardDays: number; hourlyIntervalSeconds: number; fullReconcileIntervalSeconds: number };
const defaults: Settings = { nearHistoryDays: 14, nearForwardDays: 60, hourlyIntervalSeconds: 3600, fullReconcileIntervalSeconds: 172800 };
const select = "id,iCalUId,type,seriesMasterId,subject,body,start,end,isAllDay,location,changeKey,categories,importance,showAs";

export function nearCalendarWindow(now: Date, settings = defaults) {
  return { start: new Date(now.getTime() - settings.nearHistoryDays * 86_400_000).toISOString(), end: new Date(now.getTime() + settings.nearForwardDays * 86_400_000).toISOString() };
}

export function usableStoredWindow(connection: { calendar_near_window_start: string | null; calendar_near_window_end: string | null; calendar_near_delta_link: string | null }, now: Date, settings: Settings = defaults) {
  if (!connection.calendar_near_window_start || !connection.calendar_near_window_end) return null;
  const start = Date.parse(connection.calendar_near_window_start); const end = Date.parse(connection.calendar_near_window_end);
  if (!connection.calendar_near_delta_link || Number.isNaN(start) || Number.isNaN(end)) return null;
  // Keep a delta token bound to a stable window for most of a day. Rebuild
  // before its forward horizon shrinks below the promised range.
  if (start < now.getTime() - (settings.nearHistoryDays + 1) * 86_400_000 || end < now.getTime() + (settings.nearForwardDays - 1) * 86_400_000) return null;
  return { start: connection.calendar_near_window_start, end: connection.calendar_near_window_end };
}

async function settingsFor(userId: string): Promise<Settings> {
  const admin = createAdminClient();
  const { data } = await admin.from("calendar_sync_settings").select("near_history_days,near_forward_days,hourly_interval_seconds,full_reconcile_interval_seconds").eq("user_id", userId).maybeSingle();
  return data ? { nearHistoryDays: data.near_history_days, nearForwardDays: data.near_forward_days, hourlyIntervalSeconds: data.hourly_interval_seconds, fullReconcileIntervalSeconds: data.full_reconcile_interval_seconds } : defaults;
}

export async function startCalendarSyncRun(userId: string, connectionId: string, trigger: CalendarSyncTrigger, mode: CalendarSyncMode) {
  const admin = createAdminClient(); const started = new Date();
  // Vercel executions have a finite lifetime. Recover a run abandoned by a
  // terminated function, while retaining the unique-index lock for live work.
  const { error: recoveryError } = await admin.from("calendar_sync_runs")
    .update({ status: "failed", completed_at: started.toISOString(), error_code: "calendar_sync_interrupted" })
    .eq("connection_id", connectionId).eq("user_id", userId).eq("status", "running")
    .is("archived_at", null).lt("started_at", new Date(started.getTime() - 30 * 60_000).toISOString());
  if (recoveryError) throw new MicrosoftGraphError("calendar_sync_run_unavailable");
  const { data, error } = await admin.from("calendar_sync_runs").insert({ user_id: userId, connection_id: connectionId, trigger_source: trigger, sync_mode: mode, status: "running", started_at: started.toISOString() }).select("id").maybeSingle();
  if (error?.code === "23505") return null;
  if (error || !data) throw new MicrosoftGraphError("calendar_sync_run_unavailable");
  await recordStatusSafely(userId, "calendar", { state: "syncing", lastAttemptAt: started.toISOString(), nextStep: "正在与 Outlook 对账。" }, { type: "attempted", operationKey: `calendar-run-${data.id}` });
  return { id: data.id, started };
}

export async function completeCalendarSyncRun(id: string, input: { status: "succeeded" | "failed" | "skipped"; eventCount?: number; changedCount?: number; deletedCount?: number; errorCode?: string; nextScheduledAt?: string | null; started: Date }) {
  const admin = createAdminClient();
  await admin.from("calendar_sync_runs").update({ status: input.status, event_count: input.eventCount ?? 0, changed_count: input.changedCount ?? 0, deleted_count: input.deletedCount ?? 0, error_code: input.errorCode ?? null, completed_at: new Date().toISOString(), duration_ms: Date.now() - input.started.getTime(), next_scheduled_at: input.nextScheduledAt ?? null }).eq("id", id);
}

export function graphPath(path: string) {
  if (path.startsWith("/me/calendarView/delta?")) return path;
  const url = new URL(path);
  if (url.origin !== "https://graph.microsoft.com" || url.pathname !== "/v1.0/me/calendarView/delta") throw new MicrosoftGraphError("calendar_delta_invalid_link");
  return `${url.pathname.slice("/v1.0".length)}${url.search}`;
}

async function collectGraphPages(accessToken: string, firstPath: string) {
  const events: GraphEvent[] = []; let path = firstPath;
  for (let page = 0; path; page += 1) {
    if (page >= 200) throw new MicrosoftGraphError("graph_page_loop");
    const payload = await graph(accessToken, path, { headers: { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=500' } }) as { value?: GraphEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
    if (!Array.isArray(payload?.value)) throw new MicrosoftGraphError("calendar_delta_incomplete");
    events.push(...payload.value);
    path = payload["@odata.nextLink"] ? graphPath(payload["@odata.nextLink"]!) : "";
    if (!path) return { events, deltaLink: payload["@odata.deltaLink"] ?? null };
  }
  return { events, deltaLink: null };
}

async function hydrateChangedEvents(accessToken: string, events: GraphEvent[]) {
  const hydrated: GraphEvent[] = [];
  for (const event of events) {
    if (!event.id || event["@removed"] || event.type === "seriesMaster") continue;
    // calendarView/delta can trim occurrence fields. Hydrate each changed
    // event so a partial delta response cannot erase titles or all-day data.
    // Never advance the cursor or reconcile absence after a failed hydration.
    // Even a 404 can race a deletion; the next round can retrieve its tombstone.
    hydrated.push(await graph(accessToken, `/me/events/${encodeURIComponent(event.id)}?$select=${select}`) as GraphEvent);
  }
  return hydrated;
}

export async function syncNearCalendar(connectionId: string, userId: string, trigger: CalendarSyncTrigger) {
  const admin = createAdminClient(); const now = new Date(); const settings = await settingsFor(userId);
  const { data: connection, error } = await admin.from("calendar_connections").select("calendar_near_delta_link,calendar_near_window_start,calendar_near_window_end,calendar_last_delta_sync_at,last_sync_at").eq("id", connectionId).eq("user_id", userId).eq("status", "enabled").maybeSingle();
  if (error || !connection) throw new MicrosoftGraphError("calendar_not_connected");
  const lastSuccess = Math.max(Date.parse(connection.calendar_last_delta_sync_at ?? "") || 0, Date.parse(connection.last_sync_at ?? "") || 0);
  if (["scheduled", "external_scheduler"].includes(trigger) && now.getTime() - lastSuccess < settings.hourlyIntervalSeconds * 1000) return { skipped: true, mode: "near_delta" as const };
  const stored = usableStoredWindow(connection, now, settings); const mode: CalendarSyncMode = stored ? "near_delta" : "near_full";
  const run = await startCalendarSyncRun(userId, connectionId, trigger, mode); if (!run) return { skipped: true, mode };
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const window = stored ?? nearCalendarWindow(now, settings);
    const firstPath = stored ? graphPath(connection.calendar_near_delta_link!) : `/me/calendarView/delta?${new URLSearchParams({ startDateTime: window.start, endDateTime: window.end }).toString()}`;
    const delta = await collectGraphPages(accessToken, firstPath);
    if (!delta.deltaLink) throw new MicrosoftGraphError("calendar_delta_incomplete");
    graphPath(delta.deltaLink);
    const finalEvents = [...new Map(delta.events.map((event) => [event.id, event])).values()];
    const deletedIds = finalEvents.flatMap((event) => event["@removed"] && event.id ? [event.id] : []);
    const changed = await hydrateChangedEvents(accessToken, finalEvents);
    const { data: profile } = await admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const existing = await existingCalendarEvents(admin, userId, window.start, window.end);
    const records = changed.map((event) => graphEventRecord(event, userId, existing.get(event.id), profile?.timezone || "Asia/Shanghai"));
    for (let offset = 0; offset < records.length; offset += 400) {
      const { error: upsertError } = await admin.from("calendar_events").upsert(records.slice(offset, offset + 400), { onConflict: "user_id,provider_event_id" });
      if (upsertError) throw new MicrosoftGraphError("calendar_cache_failed");
    }
    // Graph may send removed items from outside this view. Only archive rows
    // actually owned by the bounded view; the deep reconciler owns wider data.
    for (let offset = 0; offset < deletedIds.length; offset += 400) {
      const { error: deleteError } = await admin.from("calendar_events").update({ archived_at: new Date().toISOString() })
        .eq("user_id", userId).in("provider_event_id", deletedIds.slice(offset, offset + 400))
        .lt("starts_at", window.end).gt("ends_at", window.start).is("archived_at", null);
      if (deleteError) throw new MicrosoftGraphError("calendar_cache_failed");
    }
    // A window rebuild does not prove absence in the user's broader mirror.
    // Only explicit tombstones are applied here; full reconciliation remains
    // the low-frequency authority for absence and moved recurring instances.
    const succeededAt = new Date().toISOString(); const next = new Date(Date.now() + settings.hourlyIntervalSeconds * 1000).toISOString();
    const { error: cursorError } = await admin.from("calendar_connections").update({ calendar_near_delta_link: delta.deltaLink, calendar_near_window_start: window.start, calendar_near_window_end: window.end, calendar_last_delta_sync_at: succeededAt, last_sync_at: succeededAt, last_error_code: null }).eq("id", connectionId).eq("user_id", userId);
    if (cursorError) throw new MicrosoftGraphError("calendar_cache_failed");
    await completeCalendarSyncRun(run.id, { status: "succeeded", eventCount: records.length, changedCount: records.length, deletedCount: deletedIds.length, nextScheduledAt: next, started: run.started });
    await recordStatusSafely(userId, "calendar", { state: "fresh", lastSuccessAt: succeededAt, lastAttemptAt: succeededAt, nextStep: "近期待办窗口已与 Outlook 对齐。" }, { type: "succeeded", operationKey: `calendar-near-${run.id}` });
    return { skipped: false, mode, eventCount: records.length, deletedCount: deletedIds.length };
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_near_sync_failed";
    await completeCalendarSyncRun(run.id, { status: "failed", errorCode: code, started: run.started });
    if (mode === "near_delta" && ["calendar_delta_expired"].includes(code)) {
      // A delta cursor is an optimization, never a source of truth. Clear it
      // and immediately rebuild only the bounded working window.
      const { error: resetError } = await admin.from("calendar_connections").update({ calendar_near_delta_link: null, calendar_near_window_start: null, calendar_near_window_end: null }).eq("id", connectionId).eq("user_id", userId);
      if (resetError) throw new MicrosoftGraphError("calendar_cache_failed");
      return syncNearCalendar(connectionId, userId, "recovery");
    }
    await admin.from("calendar_connections").update({ last_error_code: code }).eq("id", connectionId).eq("user_id", userId);
    await recordStatusSafely(userId, "calendar", { state: "failed", lastAttemptAt: now.toISOString(), errorCode: code, errorSummary: code, nextStep: "近期待办同步失败；将由低频全量对账修复。" }, { type: "failed", operationKey: `calendar-near-${run.id}`, errorCode: code, errorSummary: code });
    throw error;
  }
}

export async function enqueueCalendarSync(connectionId: string, userId: string, reason: CalendarSyncTrigger, delaySeconds = 30) {
  const admin = createAdminClient(); const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const { error } = await admin.from("calendar_sync_queue").upsert({ connection_id: connectionId, user_id: userId, reason, requested_at: new Date().toISOString(), available_at: availableAt, attempt_count: 0 }, { onConflict: "connection_id" });
  if (error) throw new MicrosoftGraphError("calendar_sync_queue_unavailable");
}

export async function drainCalendarSyncQueue(limit = 20) {
  const admin = createAdminClient(); const { data, error } = await admin.from("calendar_sync_queue").select("connection_id,user_id,reason,requested_at").lte("available_at", new Date().toISOString()).order("available_at").limit(limit);
  if (error) throw new MicrosoftGraphError("calendar_sync_queue_unavailable");
  const results = await Promise.allSettled((data ?? []).map(async (job) => {
    try {
      const result = await syncNearCalendar(job.connection_id, job.user_id, job.reason as CalendarSyncTrigger);
      if (result.skipped) {
        // Another worker already holds the connection-level run lock. Do not
        // discard this notification: the active delta may have started before
        // it arrived, so leave a small durable retry behind it.
        await admin.from("calendar_sync_queue").update({ available_at: new Date(Date.now() + 20_000).toISOString() }).eq("connection_id", job.connection_id).eq("requested_at", job.requested_at);
        return result;
      }
      await admin.from("calendar_sync_queue").delete().eq("connection_id", job.connection_id).eq("requested_at", job.requested_at);
      return result;
    } catch (error) {
      const code = error instanceof MicrosoftGraphError ? error.code : "calendar_near_sync_failed";
      // Keep the job durable and back off instead of losing an Outlook change
      // after one transient Graph or network failure.
      const { data: current } = await admin.from("calendar_sync_queue").select("attempt_count").eq("connection_id", job.connection_id).maybeSingle();
      const attempt = Math.min(30, Number(current?.attempt_count ?? 0) + 1);
      const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(7, attempt - 1));
      await admin.from("calendar_sync_queue").update({ attempt_count: attempt, last_error_code: code, available_at: new Date(Date.now() + delaySeconds * 1000).toISOString() }).eq("connection_id", job.connection_id).eq("requested_at", job.requested_at);
      throw error;
    }
  }));
  return { processed: results.length, failed: results.filter((item) => item.status === "rejected").length };
}
