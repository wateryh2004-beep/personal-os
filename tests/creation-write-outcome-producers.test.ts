import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ owner: "owner-A", tables: new Map<string, Array<Record<string, unknown>>>(), reads: [] as Array<{ table: string; columns: string; filters: Array<[string, unknown]> }>, writes: [] as Array<{ table: string; values: Record<string, unknown> }>, todo: vi.fn(), calendar: vi.fn(), admin: vi.fn(), mark: vi.fn(), failRead: "", failRecord: false, missRecord: false, failCommit: false }));
vi.mock("@/lib/workspace-revalidation", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/tasks/repository", () => ({ microsoftTodoRepository: { create: io.todo } }));
vi.mock("@/features/inbox/service", () => ({ markInboxProcessed: io.mark }));
vi.mock("@/features/links/service", () => ({ syncEntityReferenceLinks: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/features/workbench/operation-provider", () => ({ operationRequestHash: (value: unknown) => JSON.stringify(value), runCalendarMetadataOperation: vi.fn(), runTodoMetadataOperation: vi.fn(), readTodoMetadataOutcome: vi.fn() }));
vi.mock("@/lib/adapters/microsoft-graph/calendar", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/adapters/microsoft-graph/calendar")>(), executeCalendarOperation: io.calendar }));
function query(table: string) {
  let kind = "read", values: Record<string, unknown> = {}, columns = "";
  const filters: Array<[string, unknown]> = [];
  const execute = (single: boolean) => {
    const rows = io.tables.get(table) ?? [];
    if (kind === "read") {
      io.reads.push({ table, columns, filters: [...filters] });
      if (io.failRead === table) return { data: null, error: { code: "synthetic_unavailable" } };
    } else {
      io.writes.push({ table, values });
      if (table === "todo_creation_receipts" && kind === "update" && ["rejected", "unknown"].includes(String(values.status))) {
        if (io.failRecord) return { data: null, error: { code: "synthetic_unconfirmed" } };
        if (io.missRecord) return { data: null, error: null };
      }
      if (table === "todo_creation_receipts" && values.status === "remote_committed" && io.failCommit) return { data: null, error: { code: "synthetic_unconfirmed" } };
      if (kind === "upsert" && !rows.some(row => row.user_id === values.user_id && (table === "todo_creation_receipts" ? row.request_id === values.request_id : row.id === values.id))) {
        rows.push({ id: crypto.randomUUID(), status: "prepared", task_id: null, claimed_at: null, provider_event_id: null, remote_committed_at: null, cache_committed_at: null, result: null, ...values }); io.tables.set(table, rows);
      }
      if (kind === "insert") { rows.push(values); io.tables.set(table, rows); }
    }
    const selected = rows.filter(row => filters.every(([key, value]) => value === null ? row[key] == null : row[key] === value));
    if (kind === "update") selected.forEach(row => Object.assign(row, values));
    return { data: single ? selected[0] ? { ...selected[0] } : null : selected.map(row => ({ ...row })), error: null };
  };
  const chain = {
    select(value: string) { columns = value; return chain; },
    eq(key: string, value: unknown) { filters.push([key, value]); return chain; },
    is(key: string, value: unknown) { filters.push([key, value]); return chain; },
    upsert(value: Record<string, unknown>) { kind = "upsert"; values = value; return chain; },
    insert(value: Record<string, unknown>) { kind = "insert"; values = value; return chain; },
    update(value: Record<string, unknown>) { kind = "update"; values = value; return chain; },
    maybeSingle: async () => execute(true), single: async () => execute(true),
    then(resolve: (value: ReturnType<typeof execute>) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(execute(false)).then(resolve, reject); },
  };
  return chain;
}
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ userId: io.owner, supabase: { from: query } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { io.admin(); return { from: query, rpc: vi.fn() }; } }));
import { createMicrosoftTodoTaskAction, readMicrosoftTodoCreationAction } from "@/features/tasks/microsoft-todo";
import { createCalendarEvent, readCalendarCreationIntent } from "@/features/calendar/actions";
import { MicrosoftGraphError } from "@/lib/adapters/microsoft-graph/calendar";
import { createCalendarEventSchema } from "@/features/calendar/schemas";
const requestId = "11111111-1111-4111-8111-111111111111", list = "22222222-2222-4222-8222-222222222222", inbox = "33333333-3333-4333-8333-333333333333", task = "44444444-4444-4444-8444-444444444444";
const initial = { status: "idle" as const, message: "" };
function taskForm(fromInbox = false) { const form = new FormData(); for (const [key, value] of Object.entries({ request_id: requestId, todo_list_id: list, title: "Task", body_text: "Source", importance: "normal", ...(fromInbox ? { inbox_id: inbox } : {}) })) form.set(key, value); return form; }
function calendarForm(fromInbox = false) { const form = new FormData(); for (const [key, value] of Object.entries({ request_id: requestId, subject: "Event", starts_at: "2026-10-27T08:00:00Z", ends_at: "2026-10-27T09:00:00Z", ...(fromInbox ? { inbox_id: inbox } : {}) })) form.set(key, value); return form; }
function source() { io.tables.set("inbox_items", [{ id: inbox, user_id: "owner-A", archived_at: null, processed_at: null, converted_note_id: null, converted_task_id: null, converted_todo_task_id: null }]); }
function taskReceipt(fromInbox = false) {
  const requestHash = createHash("sha256").update(JSON.stringify({ todoListId: list, title: "Task", bodyText: "Source", importance: "normal", dueAt: null, ...(fromInbox ? { inboxId: inbox } : {}) })).digest("hex");
  const row = { id: requestId, user_id: "owner-A", request_id: fromInbox ? inbox : requestId, request_hash: requestHash, status: "rejected", task_id: null as string | null }; io.tables.set("todo_creation_receipts", [row]); if (fromInbox) source(); return row;
}
function calendarReceipt(fromInbox = false) {
  const event = createCalendarEventSchema.parse({ subject: "Event", startsAt: "2026-10-27T08:00:00Z", endsAt: "2026-10-27T09:00:00Z" });
  const row: Record<string, unknown> = { id: requestId, user_id: "owner-A", request_id: fromInbox ? inbox : requestId, operation_type: "create", status: "failed", request_hash: JSON.stringify({ event, sourceTaskId: null, ...(fromInbox ? { sourceInboxId: inbox } : {}) }), result: { writeOutcome: "not_written" }, claimed_at: "2026-10-27T01:00:00Z", provider_event_id: null, remote_committed_at: null, cache_committed_at: null }; io.tables.set("calendar_operations", [row]); if (fromInbox) source(); return row;
}
beforeEach(() => {
  vi.clearAllMocks(); io.owner = "owner-A"; io.tables.clear(); io.reads.length = 0; io.writes.length = 0; io.failRead = ""; io.failRecord = false; io.missRecord = false; io.failCommit = false;
  io.tables.set("calendar_connections", [{ id: "connection", status: "enabled", archived_at: null, oauth_scope_version: 1 }]); io.tables.set("profiles", [{ user_id: "owner-A", timezone: "UTC" }]);
  io.todo.mockReset().mockRejectedValue(new MicrosoftGraphError("graph_access_denied", "not_written")); io.calendar.mockReset(); io.mark.mockReset().mockResolvedValue(true);
});
it("task producer reports structured Graph rejection only after the rejected receipt was authoritatively recorded", async () => {
  expect(await createMicrosoftTodoTaskAction(initial, taskForm())).toMatchObject({ status: "error", writeOutcome: "not_written" });
  expect(io.tables.get("todo_creation_receipts")?.[0]).toMatchObject({ status: "rejected", task_id: null }); expect(io.todo).toHaveBeenCalledOnce(); expect(io.mark).not.toHaveBeenCalled();
});
it.each(["error", "CAS-miss"])("task rejection stays unknown if its receipt recording is unconfirmed: %s", async kind => {
  io.failRecord = kind === "error"; io.missRecord = kind === "CAS-miss";
  expect((await createMicrosoftTodoTaskAction(initial, taskForm())).writeOutcome).not.toBe("not_written");
});
it.each(["408", "409", "429", "500", "network", "graph_unavailable"])("task unknown %s keeps its request unresolved and does not dispatch twice", async code => {
  io.todo.mockRejectedValueOnce(new MicrosoftGraphError(code, "unknown")); const form = taskForm();
  expect((await createMicrosoftTodoTaskAction(initial, form)).writeOutcome).not.toBe("not_written");
  expect((await readMicrosoftTodoCreationAction(form)).writeOutcome).not.toBe("not_written");
  expect(io.todo).toHaveBeenCalledOnce(); expect(io.tables.get("todo_creation_receipts")?.[0].status).toBe("unknown");
});
it("a provider-created task with unconfirmed local commit is never labelled not written", async () => {
  io.todo.mockResolvedValueOnce(task); io.failCommit = true;
  expect((await createMicrosoftTodoTaskAction(initial, taskForm())).writeOutcome).not.toBe("not_written"); expect(io.mark).not.toHaveBeenCalled(); expect(io.todo).toHaveBeenCalledOnce();
});
it.each(["rejected", "cancelled"])("task pure read recognizes exact owner/hash %s without dispatch or writes", async status => {
  taskReceipt().status = status; expect((await readMicrosoftTodoCreationAction(taskForm())).writeOutcome).toBe("not_written"); expect(io.writes).toEqual([]); expect(io.admin).not.toHaveBeenCalled(); expect(io.todo).not.toHaveBeenCalled(); expect(io.reads.every(read => read.filters.some(([key, value]) => key === "user_id" && value === "owner-A"))).toBe(true);
});
it("task rejected receipt is reusable only as a read outcome for its exact still-unprocessed Inbox source", async () => {
  taskReceipt(true); expect((await readMicrosoftTodoCreationAction(taskForm(true))).writeOutcome).toBe("not_written");
  expect(io.reads.some(read => read.table === "inbox_items" && read.filters.some(([key, value]) => key === "id" && value === inbox))).toBe(true);
  expect(io.writes).toEqual([]); expect(io.admin).not.toHaveBeenCalled(); expect(io.todo).not.toHaveBeenCalled(); expect(io.mark).not.toHaveBeenCalled();
});
it.each(["prepared", "processing", "unknown", "remote_committed", "available"])("task pure read cannot release %s", async status => {
  taskReceipt().status = status; expect((await readMicrosoftTodoCreationAction(taskForm())).writeOutcome).not.toBe("not_written"); expect(io.writes).toEqual([]); expect(io.todo).not.toHaveBeenCalled();
});
it.each(["task-present", "hash", "owner", "unavailable", "missing", "partial-source"])("task pure read stays unresolved for %s", async reason => {
  const row = taskReceipt(reason === "partial-source"), form = taskForm(reason === "partial-source");
  if (reason === "task-present") row.task_id = task;
  if (reason === "hash") form.set("title", "Changed");
  if (reason === "owner") io.owner = "owner-B";
  if (reason === "unavailable") io.failRead = "todo_creation_receipts";
  if (reason === "missing") io.tables.delete("todo_creation_receipts");
  if (reason === "partial-source") io.tables.get("inbox_items")![0].processed_at = "2026-10-27T01:00:00Z";
  expect((await readMicrosoftTodoCreationAction(form)).writeOutcome).not.toBe("not_written"); expect(io.writes).toEqual([]); expect(io.todo).not.toHaveBeenCalled();
});
it("Calendar create returns not_written for a real structured Graph403 error only with the persisted failed/claimed rejection evidence", async () => {
  io.calendar.mockImplementation(async (id: string) => { const row = io.tables.get("calendar_operations")!.find(row => row.id === id)!; Object.assign(row, { status: "failed", claimed_at: "2026-10-27T01:00:00Z", result: { writeOutcome: "not_written" } }); throw new MicrosoftGraphError("graph_access_denied", "not_written"); });
  const result = await createCalendarEvent(initial, calendarForm()); expect(result).toMatchObject({ status: "error", writeOutcome: "not_written", operationId: requestId }); expect(io.calendar).toHaveBeenCalledOnce();
  expect(io.tables.get("calendar_operations")![0].claimed_at).not.toBeNull(); expect(io.reads.some(read => read.table === "calendar_operations" && read.columns.includes("remote_committed_at") && read.columns.includes("result"))).toBe(true);
});
it.each(["429", "500", "network", "graph_unavailable", "receipt-unconfirmed", "provider", "remote", "cache"])("Calendar create never releases unknown or partial %s", async reason => {
  io.calendar.mockImplementation(async (id: string) => {
    const row = io.tables.get("calendar_operations")!.find(row => row.id === id)!; Object.assign(row, { status: "failed", claimed_at: "2026-10-27T01:00:00Z", result: { writeOutcome: "not_written" } });
    if (["429", "500", "network", "graph_unavailable"].includes(reason)) row.result = null;
    if (reason === "provider") row.provider_event_id = "provider-event";
    if (reason === "remote") row.remote_committed_at = "2026-10-27T01:00:00Z";
    if (reason === "cache") row.cache_committed_at = "2026-10-27T01:00:00Z";
    if (reason === "receipt-unconfirmed") io.failRead = "calendar_operations";
    throw new MicrosoftGraphError(reason, ["429", "500", "network", "graph_unavailable"].includes(reason) ? "unknown" : "not_written");
  });
  expect((await createCalendarEvent(initial, calendarForm())).writeOutcome).not.toBe("not_written");
  expect((await readCalendarCreationIntent(calendarForm())).writeOutcome).not.toBe("not_written"); expect(io.calendar).toHaveBeenCalledOnce();
});
it.each(["failed", "cancelled"])("Calendar pure read recognizes exact %s and never claims or executes", async status => {
  const row = calendarReceipt(); row.status = status; if (status === "cancelled") { row.claimed_at = null; row.result = null; }
  expect((await readCalendarCreationIntent(calendarForm())).writeOutcome).toBe("not_written"); expect(io.writes).toEqual([]); expect(io.calendar).not.toHaveBeenCalled(); expect(io.admin).not.toHaveBeenCalled();
});
it("Calendar failed receipt requires its exact still-unprocessed Inbox source without finishing or claiming it", async () => {
  calendarReceipt(true); expect((await readCalendarCreationIntent(calendarForm(true))).writeOutcome).toBe("not_written");
  expect(io.reads.some(read => read.table === "inbox_items" && read.filters.some(([key, value]) => key === "id" && value === inbox))).toBe(true);
  expect(io.writes).toEqual([]); expect(io.admin).not.toHaveBeenCalled(); expect(io.calendar).not.toHaveBeenCalled(); expect(io.mark).not.toHaveBeenCalled();
});
it.each(["provider", "remote", "cache", "cancel-claimed", "no-result", "unknown-result", "processing", "operation", "hash", "owner", "missing", "unavailable", "partial-source"])("Calendar pure read never releases %s", async reason => {
  const row = calendarReceipt(reason === "partial-source"), form = calendarForm(reason === "partial-source");
  if (reason === "provider") row.provider_event_id = "provider-event";
  if (reason === "remote") row.remote_committed_at = "2026-10-27T01:00:00Z";
  if (reason === "cache") row.cache_committed_at = "2026-10-27T01:00:00Z";
  if (reason === "cancel-claimed") row.status = "cancelled";
  if (reason === "no-result") row.result = null;
  if (reason === "unknown-result") row.result = { writeOutcome: "unknown" };
  if (reason === "processing") row.status = "processing";
  if (reason === "operation") row.operation_type = "update";
  if (reason === "hash") form.set("subject", "Changed");
  if (reason === "owner") io.owner = "owner-B";
  if (reason === "missing") io.tables.delete("calendar_operations");
  if (reason === "unavailable") io.failRead = "calendar_operations";
  if (reason === "partial-source") io.tables.get("inbox_items")![0].converted_note_id = requestId;
  expect((await readCalendarCreationIntent(form)).writeOutcome).not.toBe("not_written"); expect(io.writes).toEqual([]); expect(io.calendar).not.toHaveBeenCalled(); expect(io.admin).not.toHaveBeenCalled();
});
it("both create schemas expose a finite not-written validation outcome before any provider dispatch", async () => {
  const todo = taskForm(), calendar = calendarForm(); todo.delete("body_text"); calendar.set("ends_at", "2026-10-27T07:00:00Z");
  expect((await createMicrosoftTodoTaskAction(initial, todo)).writeOutcome).toBe("not_written"); expect((await createCalendarEvent(initial, calendar)).writeOutcome).toBe("not_written"); expect(io.todo).not.toHaveBeenCalled(); expect(io.calendar).not.toHaveBeenCalled(); expect(io.writes).toEqual([]);
});
