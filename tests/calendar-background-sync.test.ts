import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ graph: vi.fn(), access: vi.fn(), cache: vi.fn(), resolve: vi.fn(), calls: [] as Array<{ table: string; action: string; value?: unknown; filters: Array<[string, ...unknown[]]> }> }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const call = { table, action: "select", value: undefined as unknown, filters: [] as Array<[string, ...unknown[]]> };
  const query = {
    select: () => query,
    insert: (value: unknown) => { call.action = "insert"; call.value = value; return query; },
    update: (value: unknown) => { call.action = "update"; call.value = value; return query; },
    upsert: (value: unknown) => { call.action = "upsert"; call.value = value; return query; },
    delete: () => { call.action = "delete"; return query; },
    eq: (...values: unknown[]) => { call.filters.push(["eq", ...values]); return query; },
    is: (...values: unknown[]) => { call.filters.push(["is", ...values]); return query; },
    lt: (...values: unknown[]) => { call.filters.push(["lt", ...values]); return query; },
    gt: (...values: unknown[]) => { call.filters.push(["gt", ...values]); return query; },
    lte: (...values: unknown[]) => { call.filters.push(["lte", ...values]); return query; },
    in: (...values: unknown[]) => { call.filters.push(["in", ...values]); return query; },
    limit: () => query, order: () => query, maybeSingle: () => query,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => { mocks.calls.push(call); return Promise.resolve(mocks.resolve(call)).then(resolve, reject); },
  };
  return query;
} }) }));
vi.mock("@/features/system-status/service", () => ({ recordStatusSafely: vi.fn() }));
vi.mock("@/lib/adapters/microsoft-graph/calendar", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/adapters/microsoft-graph/calendar")>(),
  graph: mocks.graph, accessTokenForConnection: mocks.access, existingCalendarEvents: mocks.cache,
}));
import { drainCalendarSyncQueue, graphPath, nearCalendarWindow, startCalendarSyncRun, syncNearCalendar, usableStoredWindow } from "@/lib/services/calendar-near-sync";
import { MicrosoftGraphError } from "@/lib/adapters/microsoft-graph/calendar";

const now = new Date("2026-10-06T14:00:00Z");
const window = nearCalendarWindow(now);
const cursor = "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=fixture";
const event = { id: "event", subject: "Fixture", start: { dateTime: "2026-10-06T14:00:00Z" }, end: { dateTime: "2026-10-06T15:00:00Z" }, categories: [] };
const connection = () => ({ calendar_near_window_start: window.start, calendar_near_window_end: window.end, calendar_near_delta_link: cursor, last_sync_at: null, calendar_last_delta_sync_at: null });
const baseResolve = (call: typeof mocks.calls[number]) => {
  if (call.table === "calendar_connections" && call.action === "select") return { data: connection(), error: null };
  if (call.table === "calendar_sync_runs" && call.action === "insert") return { data: { id: "run" }, error: null };
  if (call.table === "profiles") return { data: { timezone: "Asia/Shanghai" }, error: null };
  return { data: null, error: null };
};
const writes = () => mocks.calls.filter((c) => c.table === "calendar_events" && c.action !== "select");
const cursors = () => mocks.calls.filter((c) => c.table === "calendar_connections" && c.action === "update" && (c.value as Record<string, unknown>).calendar_near_delta_link);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  mocks.calls.length = 0; mocks.resolve.mockReset().mockImplementation(baseResolve);
  mocks.access.mockReset().mockResolvedValue("fixture-token"); mocks.cache.mockReset().mockResolvedValue(new Map()); mocks.graph.mockReset();
});

describe("background calendar sync safety", () => {
  it("reuses a stable window all day and rolls it after the promised horizon shrinks", () => {
    expect(usableStoredWindow(connection(), new Date(now.getTime() + 3600_000))).toEqual(window);
    expect(usableStoredWindow(connection(), new Date(now.getTime() + 25 * 3600_000))).toBeNull();
  });
  it("rejects foreign or unexpected cursor targets", () => {
    expect(graphPath(cursor)).toBe("/me/calendarView/delta?$deltatoken=fixture");
    expect(() => graphPath("https://evil.example/me/calendarView/delta?a=b")).toThrow();
    expect(() => graphPath("https://graph.microsoft.com/v1.0/me/messages?a=b")).toThrow();
  });
  it("skips a scheduled pull when a recent full or delta sync already covered it", async () => {
    mocks.resolve.mockImplementation((call) => call.table === "calendar_connections" && call.action === "select" ? { data: { ...connection(), last_sync_at: now.toISOString() } } : baseResolve(call));
    expect((await syncNearCalendar("connection", "owner", "external_scheduler")).skipped).toBe(true);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("does not archive or advance a cursor when hydration fails", async () => {
    mocks.graph.mockResolvedValueOnce({ value: [event], "@odata.deltaLink": cursor }).mockRejectedValueOnce(new MicrosoftGraphError("graph_request_failed"));
    await expect(syncNearCalendar("connection", "owner", "external_scheduler")).rejects.toThrow("graph_request_failed");
    expect(writes()).toEqual([]); expect(cursors()).toEqual([]); expect(mocks.graph).toHaveBeenCalledTimes(2);
  });
  it("does not mutate cache on incomplete pagination", async () => {
    mocks.graph.mockResolvedValueOnce({ value: [event], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=fixture" }).mockRejectedValueOnce(new MicrosoftGraphError("graph_unavailable"));
    await expect(syncNearCalendar("connection", "owner", "webhook")).rejects.toThrow();
    expect(writes()).toEqual([]); expect(cursors()).toEqual([]);
  });
  it("deduplicates changed IDs and preserves app classification", async () => {
    mocks.graph.mockResolvedValueOnce({ value: [event, event], "@odata.deltaLink": cursor }).mockResolvedValueOnce(event);
    mocks.cache.mockResolvedValue(new Map([["event", { categories: ["App category"] }]]));
    await syncNearCalendar("connection", "owner", "webhook");
    expect(mocks.graph).toHaveBeenCalledTimes(2);
    expect(writes()[0].value).toMatchObject([{ provider_event_id: "event", categories: ["App category"], user_id: "owner" }]);
    expect(cursors()).toHaveLength(1);
    expect(mocks.graph.mock.calls.every((call) => !call[2]?.method || call[2].method === "GET")).toBe(true);
  });
  it("limits tombstones to the local bounded window, never archives absent rows", async () => {
    mocks.graph.mockResolvedValueOnce({ value: [{ id: "removed", "@removed": { reason: "deleted" } }], "@odata.deltaLink": cursor });
    await syncNearCalendar("connection", "owner", "webhook");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["eq", "user_id", "owner"], ["lt", "starts_at", window.end], ["gt", "ends_at", window.start], ["in", "provider_event_id", ["removed"]]]));
  });
  it("keeps cursor unchanged when local writes fail", async () => {
    mocks.graph.mockResolvedValueOnce({ value: [event], "@odata.deltaLink": cursor }).mockResolvedValueOnce(event);
    mocks.resolve.mockImplementation((call) => call.table === "calendar_events" && call.action === "upsert" ? { error: { code: "unavailable" } } : baseResolve(call));
    await expect(syncNearCalendar("connection", "owner", "webhook")).rejects.toThrow("calendar_cache_failed");
    expect(cursors()).toEqual([]);
  });
  it("retains the connection lock when another live run holds it", async () => {
    mocks.resolve.mockImplementation((call) => call.table === "calendar_sync_runs" && call.action === "insert" ? { error: { code: "23505" } } : baseResolve(call));
    expect(await startCalendarSyncRun("owner", "connection", "scheduled", "near_delta")).toBeNull();
    expect(mocks.calls[0].filters).toContainEqual(["lt", "started_at", "2026-10-06T13:30:00.000Z"]);
  });
  it("does not delete a newer notification received during a pull", async () => {
    mocks.resolve.mockImplementation((call) => call.table === "calendar_sync_queue" && call.action === "select" ? { data: [{ connection_id: "connection", user_id: "owner", reason: "webhook", requested_at: "original-request" }] } : baseResolve(call));
    mocks.graph.mockResolvedValueOnce({ value: [], "@odata.deltaLink": cursor });
    await drainCalendarSyncQueue();
    const deletion = mocks.calls.find((call) => call.table === "calendar_sync_queue" && call.action === "delete");
    expect(deletion?.filters).toContainEqual(["eq", "requested_at", "original-request"]);
  });
});

import { calendarSchedulerStatus } from "@/features/calendar/scheduler-status";
describe("truthful scheduler status", () => {
  it("does not advertise hourly sync before a completed job exists", () => {
    expect(calendarSchedulerStatus([])).toMatchObject({ backgroundSyncLabel: "尚未验证后台调度", nextHourlyAt: null });
  });
  it("distinguishes the daily fallback from hourly scheduling", () => {
    expect(calendarSchedulerStatus([{ trigger_source: "scheduled", completed_at: now.toISOString(), next_scheduled_at: "tomorrow", failed_count: 0, error_code: null }]).backgroundSyncLabel).toContain("后台每日同步");
  });
  it("does not turn failed or stale hourly telemetry into a future promise", () => {
    expect(calendarSchedulerStatus([{ trigger_source: "external_scheduler", completed_at: now.toISOString(), next_scheduled_at: "later", failed_count: 1, error_code: "failure" }]).nextHourlyAt).toBeNull();
  });
});
