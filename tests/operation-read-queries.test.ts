import { beforeEach, describe, expect, it, vi } from "vitest";
import type { requireOwnerApi } from "@/lib/auth/require-owner";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("@/lib/adapters/microsoft-graph/calendar", () => ({ readMicrosoftTodoMutationSnapshot: mocks.snapshot }));
import { readOperationTimezone, readPendingCalendarTasksQuery, readCalendarScheduleConflictsQuery, readCalendarScheduleTaskQuery } from "@/features/workbench/operation-read-queries";

const ownerId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const otherTaskId = "20000000-0000-4000-8000-000000000002";
type Row = Record<string, unknown>;
type Fixture = { rows?: Record<string, Row[]>; failure?: string };
let calls: unknown[][];
const task = (id: string, overrides: Row = {}): Row => ({ id, user_id: ownerId, title: "Owned", status: "notStarted", provider_last_modified_at: null, archived_at: null, due_at: "2030-01-01", body_text: "must not be projected", ...overrides });

/** Executes the finite query protocol against synthetic rows; filters and the
 * 101st sentinel affect the returned data rather than being no-op mock methods. */
function owner({ rows: overrides, failure }: Fixture = {}) {
  const rows: Record<string, Row[]> = {
    profiles: [{ user_id: ownerId, timezone: "Asia/Shanghai" }],
    microsoft_todo_tasks: [task(taskId), task(otherTaskId, { user_id: "foreign", title: "Foreign secret" }), task("20000000-0000-4000-8000-000000000003", { status: "completed" }), task("20000000-0000-4000-8000-000000000004", { archived_at: "2029-01-01" })],
    task_planning: [{ user_id: "foreign", task_id: taskId, estimated_minutes: 999 }, { user_id: ownerId, task_id: taskId, estimated_minutes: 45 }, { user_id: ownerId, task_id: otherTaskId, estimated_minutes: 300 }],
    calendar_connections: [{ id: "connection", user_id: ownerId, status: "enabled", archived_at: null }],
    calendar_events: Array.from({ length: 22 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`, user_id: ownerId, subject: "Fixture", starts_at: "2030-01-01T01:00:00Z", ends_at: "2030-01-01T02:00:00Z", archived_at: null })),
    ...overrides,
  };
  return { userId: ownerId, supabase: { from(table: string) {
    calls.push(["from", table]);
    let columns: string[] = [];
    let values = [...(rows[table] ?? [])];
    const result = () => ({ data: failure === table ? null : values.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))), error: failure === table ? { message: "synthetic offline" } : null });
    const query = {
      select(value: string) { calls.push([table, "select", value]); columns = value.split(","); return query; },
      eq(key: string, value: unknown) { calls.push([table, "eq", key, value]); values = values.filter(row => row[key] === value); return query; },
      neq(key: string, value: unknown) { calls.push([table, "neq", key, value]); values = values.filter(row => row[key] !== value); return query; },
      is(key: string, value: unknown) { calls.push([table, "is", key, value]); values = values.filter(row => row[key] === value); return query; },
      in(key: string, ids: string[]) { calls.push([table, "in", key, ids]); values = values.filter(row => ids.includes(String(row[key]))); return query; },
      order(key: string, options?: { ascending?: boolean }) { calls.push([table, "order", key, options]); values.sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (options?.ascending === false ? -1 : 1)); return query; },
      limit(value: number) { calls.push([table, "limit", value]); values = values.slice(0, value); return query; },
      lt(key: string, value: string) { values = values.filter(row => String(row[key]) < value); return query; },
      gt(key: string, value: string) { values = values.filter(row => String(row[key]) > value); return query; },
      maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; },
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  } } } as unknown as Awaited<ReturnType<typeof requireOwnerApi>>;
}

beforeEach(() => { calls = []; vi.clearAllMocks(); });
describe("fixed server-only operation projections", () => {
  it("joins only the verified owner's bounded task plans without exposing bodies or browser identity", async () => {
    const value = await readPendingCalendarTasksQuery(owner());
    expect(value).toEqual({ timezone: "Asia/Shanghai", tasks: [{ id: taskId, title: "Owned", status: "notStarted", provider_last_modified_at: null, estimated_minutes: 45 }], truncated: false });
    expect(calls).toContainEqual(["microsoft_todo_tasks", "eq", "user_id", ownerId]);
    expect(calls).toContainEqual(["profiles", "eq", "user_id", ownerId]);
    expect(calls).toContainEqual(["microsoft_todo_tasks", "limit", 101]);
    expect(calls).toContainEqual(["microsoft_todo_tasks", "order", "due_at", { ascending: true }]);
    expect(calls).toContainEqual(["task_planning", "select", "task_id,estimated_minutes"]);
    expect(calls).toContainEqual(["task_planning", "eq", "user_id", ownerId]);
    expect(calls).toContainEqual(["task_planning", "in", "task_id", [taskId]]);
  });

  it.each([100, 101, 105])("returns at most 100 tasks and reports a real %i-row sentinel", async (count) => {
    const tasks = Array.from({ length: count }, (_, index) => task(`20000000-0000-4000-8000-${String(index).padStart(12, "0")}`));
    const value = await readPendingCalendarTasksQuery(owner({ rows: { microsoft_todo_tasks: tasks, task_planning: [] } }));
    expect(value.tasks).toHaveLength(100);
    expect(value.tasks.map(row => row.id)).toEqual(tasks.slice(0, 100).map(row => row.id));
    expect(value.tasks.every(row => row.estimated_minutes === null)).toBe(true);
    expect(value.truncated).toBe(count > 100);
    expect(calls).toContainEqual(["task_planning", "in", "task_id", tasks.slice(0, 100).map(row => row.id)]);
    expect(calls).toContainEqual(["microsoft_todo_tasks", "limit", 101]);
  });

  it("does not read planning for an empty task set or invent an estimate", async () => {
    expect(await readPendingCalendarTasksQuery(owner({ rows: { microsoft_todo_tasks: [] } }))).toEqual({ timezone: "Asia/Shanghai", tasks: [], truncated: false });
    expect(calls).not.toContainEqual(["from", "task_planning"]);
    const result = await readPendingCalendarTasksQuery(owner({ rows: { task_planning: [] } }));
    expect(result.tasks[0].estimated_minutes).toBeNull();
  });

  it.each([["microsoft_todo_tasks", "todo_read_unavailable"], ["task_planning", "planning_read_unavailable"], ["profiles", "timezone_unavailable"]])("rejects %s failures instead of returning a misleading empty or partial result", async (failure, message) => {
    await expect(readPendingCalendarTasksQuery(owner({ failure }))).rejects.toThrow(message);
    if (failure !== "task_planning") expect(calls).not.toContainEqual(["from", "task_planning"]);
  });

  it("rejects an invalid stored estimate at the transport schema boundary", async () => {
    await expect(readPendingCalendarTasksQuery(owner({ rows: { task_planning: [{ user_id: ownerId, task_id: taskId, estimated_minutes: -1 }] } }))).rejects.toThrow();
  });

  it("keeps conflicts bounded to 20 and discloses truncation", async () => {
    const value = await readCalendarScheduleConflictsQuery(owner(), { startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-01-02T00:00:00Z" });
    expect(value.events).toHaveLength(20); expect(value.truncated).toBe(true);
    expect(calls).toContainEqual(["calendar_events", "eq", "user_id", ownerId]); expect(calls).toContainEqual(["calendar_events", "limit", 21]);
  });
  it("passes the verified owner to the provider read adapter", async () => {
    const snapshot = { id: taskId, title: "Owned remote", importance: "normal", dueAt: null, status: "inProgress", completedAt: null, lastModifiedAt: null, etag: null };
    mocks.snapshot.mockResolvedValue(snapshot);
    expect(await readCalendarScheduleTaskQuery(owner(), taskId)).toEqual(snapshot);
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith("connection", ownerId, taskId);
  });
  it("does not manufacture a timezone on read error", async () => {
    await expect(readOperationTimezone(owner({ failure: "profiles" }))).rejects.toThrow("timezone_unavailable");
  });
});
