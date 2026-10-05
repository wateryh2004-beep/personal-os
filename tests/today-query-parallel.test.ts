import { beforeEach, describe, expect, it, vi } from "vitest";
import type { requireOwner } from "@/lib/auth/require-owner";
import { getTodayFocus } from "@/features/today/focus-queries";
import { getTodayWorkspace } from "@/features/today/queries";
import { createWorkspaceLatencyProfiler } from "@/lib/performance/workspace-latency";
import type { NowTask } from "@/features/today/types";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), after: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/features/proactive/service", () => ({ reconcileProactiveInsights: mocks.reconcile }));

type Owner = Awaited<ReturnType<typeof requireOwner>>;
type QueryResult = { data: unknown; error: { message: string } | null; count?: number };
type QueryStep = { method: string; args: unknown[] };
type QueryRead = { table: string; steps: QueryStep[] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const result = (data: unknown): QueryResult => ({ data, error: null });
const now = new Date("2026-10-02T00:30:00.000Z");
const candidate: NowTask = { id: "candidate", title: "Candidate", due_at: null, importance: "normal", status: "notStarted" };
const olderSelection: NowTask = { ...candidate, id: "older", title: "Older selection", status: "completed" };

function compact(timezone = "America/Los_Angeles") {
  return result({ timezone, tasks: [], events: [], connection: null, milestones: [], inbox_count: 0,
    weekly_review_completed: true, due_decisions: [], briefing_date: null, briefing_entries: [] });
}

function hasStep(read: QueryRead, method: string, first: unknown, second?: unknown) {
  return read.steps.some((step) => step.method === method && step.args[0] === first
    && (second === undefined || step.args[1] === second));
}

function harness(options: { fallback?: boolean } = {}) {
  const source = deferred<QueryResult>();
  const candidates = deferred<QueryResult>();
  const priorities = deferred<QueryResult>();
  const profile = deferred<QueryResult>();
  const selected = deferred<QueryResult>();
  const reads: QueryRead[] = [];
  const rpc = vi.fn(() => source.promise);
  const supabase = {
    rpc,
    from(table: string) {
      const read: QueryRead = { table, steps: [] };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "neq", "order", "limit", "in", "lt", "gt", "gte", "lte", "not", "maybeSingle"]) {
        query[method] = (...args: unknown[]) => { read.steps.push({ method, args }); return query; };
      }
      // Match Supabase's lazy thenable: only awaiting a builder starts its read.
      query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => {
        reads.push(read);
        let response: Promise<QueryResult>;
        if (table === "today_task_priorities") response = priorities.promise;
        else if (table === "microsoft_todo_tasks" && hasStep(read, "neq", "status", "completed")) response = candidates.promise;
        else if (table === "microsoft_todo_tasks" && hasStep(read, "in", "id")) response = selected.promise;
        else if (table === "profiles") response = profile.promise;
        else if (options.fallback) response = Promise.resolve(table === "calendar_connections" || table === "reviews" ? result(null) : { ...result([]), count: 0 });
        else throw new Error(`Unexpected query: ${table}`);
        return response.then(resolve, reject);
      };
      return query;
    },
  };
  const owner = { supabase, userId: "server-owner", email: "owner@example.test" } as unknown as Owner;
  mocks.owner.mockResolvedValue(owner);
  const focusReads = () => reads.filter((read) => read.table === "microsoft_todo_tasks" && hasStep(read, "neq", "status", "completed"));
  const priorityReads = () => reads.filter((read) => read.table === "today_task_priorities");
  const selectedReads = () => reads.filter((read) => read.table === "microsoft_todo_tasks" && hasStep(read, "in", "id"));
  const run = (explicitOwner?: Owner, instant = now) => getTodayWorkspace(instant, explicitOwner, createWorkspaceLatencyProfiler("today", "api"));
  return { source, candidates, priorities, profile, selected, reads, rpc, owner, focusReads, priorityReads, selectedReads, run };
}

// Drain promise continuations without a wall-clock latency threshold or real database.
async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

beforeEach(() => { vi.resetAllMocks(); });

describe("Today workspace read concurrency", () => {
  it("starts candidates and bounded priorities alongside the compact read", async () => {
    const h = harness();
    const workspaceRead = h.run();
    await flush();
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("get_today_workspace_read_model", { p_now: now.toISOString() });
    expect(h.focusReads()).toHaveLength(1);
    expect(h.priorityReads()).toHaveLength(1);
    expect(mocks.owner).toHaveBeenCalledTimes(1);

    h.source.resolve(compact());
    await flush();
    expect(h.priorityReads()).toHaveLength(1);
    expect(hasStep(h.priorityReads()[0], "gte", "focus_date", "2026-10-01")).toBe(true);
    expect(hasStep(h.priorityReads()[0], "lte", "focus_date", "2026-10-03")).toBe(true);
    expect(h.selectedReads()).toHaveLength(0);
    h.priorities.resolve(result([{ focus_date: "2026-10-01", task_id: "older", position: 0 }, { focus_date: "2026-10-01", task_id: "candidate", position: 1 }]));
    await flush();
    expect(h.selectedReads()).toHaveLength(0);
    h.candidates.resolve(result([candidate]));
    await flush();
    expect(h.selectedReads()).toHaveLength(1);
    expect(h.selectedReads()[0].steps).toContainEqual({ method: "in", args: ["id", ["older"]] });
    expect(hasStep(h.selectedReads()[0], "neq", "status", "completed")).toBe(false);
    h.selected.resolve(result([olderSelection]));

    const workspace = await workspaceRead;
    expect(workspace.focus).toEqual({ date: "2026-10-01", selectedIds: ["older", "candidate"],
      selectedTasks: [olderSelection, candidate], candidates: [candidate], available: true });
    expect(h.focusReads()).toHaveLength(1);
    expect(h.focusReads()[0].steps).toEqual([
      { method: "select", args: ["id,title,due_at,importance,status"] },
      { method: "eq", args: ["user_id", "server-owner"] },
      { method: "is", args: ["archived_at", null] },
      { method: "neq", args: ["status", "completed"] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "limit", args: [200] },
    ]);
    expect(hasStep(h.priorityReads()[0], "eq", "user_id", "server-owner")).toBe(true);
    expect(hasStep(h.selectedReads()[0], "eq", "user_id", "server-owner")).toBe(true);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["Etc/GMT+12", "2026-10-01"],
    ["Pacific/Kiritimati", "2026-10-02"],
    ["Asia/Shanghai", "2026-10-02"],
  ])("filters preloaded adjacent dates to the exact %s date", async (timezone, date) => {
    const h = harness();
    const workspaceRead = h.run();
    h.priorities.resolve(result([
      { focus_date: "2026-10-01", task_id: "yesterday", position: 0 },
      { focus_date: "2026-10-02", task_id: "today", position: 0 },
      { focus_date: "2026-10-03", task_id: "tomorrow", position: 0 },
    ]));
    const tasks = ["yesterday", "today", "tomorrow"].map((id) => ({ ...candidate, id }));
    h.candidates.resolve(result(tasks));
    h.source.resolve(compact(timezone));
    const workspace = await workspaceRead;
    expect(workspace.focus?.date).toBe(date);
    expect(workspace.focus?.selectedIds).toEqual([date === "2026-10-01" ? "yesterday" : "today"]);
    expect(h.priorityReads()).toHaveLength(1);
    expect(h.selectedReads()).toHaveLength(0);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("includes the next UTC date for UTC+14 late in the UTC day", async () => {
    const h = harness();
    const workspaceRead = h.run(undefined, new Date("2026-10-02T23:30:00Z"));
    h.priorities.resolve(result([
      { focus_date: "2026-10-02", task_id: "wrong-day", position: 1 },
      { focus_date: "2026-10-03", task_id: candidate.id, position: 1 },
    ]));
    h.candidates.resolve(result([candidate]));
    h.source.resolve(compact("Pacific/Kiritimati"));
    expect((await workspaceRead).focus).toMatchObject({ date: "2026-10-03", selectedIds: [candidate.id] });
    expect(hasStep(h.priorityReads()[0], "lte", "focus_date", "2026-10-03")).toBe(true);
    expect(h.selectedReads()).toHaveLength(0);
  });

  it("reuses an early candidate result and an explicit owner without another query or auth read", async () => {
    const h = harness();
    const workspaceRead = h.run(h.owner);
    h.candidates.resolve(result([candidate]));
    await flush();
    expect(h.focusReads()).toHaveLength(1);
    expect(h.priorityReads()).toHaveLength(1);
    h.source.resolve(compact("Asia/Shanghai"));
    h.priorities.resolve(result([{ focus_date: "2026-10-02", task_id: candidate.id, position: 0 }]));
    const workspace = await workspaceRead;
    expect(workspace.focus).toMatchObject({ date: "2026-10-02", selectedTasks: [candidate], available: true });
    expect(h.focusReads()).toHaveLength(1);
    expect(h.selectedReads()).toHaveLength(0);
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("keeps candidate reads concurrent through legacy fallback and uses the fallback profile timezone", async () => {
    const h = harness({ fallback: true });
    const workspaceRead = h.run();
    await flush();
    expect(h.focusReads()).toHaveLength(1);
    h.source.resolve({ data: null, error: { message: "RPC unavailable" } });
    await flush();
    expect(h.reads.filter((read) => read.table === "profiles")).toHaveLength(1);
    expect(h.priorityReads()).toHaveLength(1);
    h.profile.resolve(result({ timezone: "Pacific/Honolulu" }));
    await flush();
    expect(hasStep(h.priorityReads()[0], "gte", "focus_date", "2026-10-01")).toBe(true);
    expect(hasStep(h.priorityReads()[0], "lte", "focus_date", "2026-10-03")).toBe(true);
    h.priorities.resolve(result([]));
    h.candidates.resolve(result([candidate]));
    const workspace = await workspaceRead;
    expect(workspace).toMatchObject({ timezone: "Pacific/Honolulu", focus: { date: "2026-10-01", candidates: [candidate], available: true } });
    expect(h.focusReads()).toHaveLength(1);
    expect(h.reads.filter((read) => read.table === "microsoft_todo_tasks" && hasStep(read, "limit", 80))).toHaveLength(1);
    expect(mocks.owner).toHaveBeenCalledTimes(1);
  });

  it("settles an early candidate transport failure without rejecting the workspace", async () => {
    const h = harness();
    let settled = false;
    const workspaceRead = h.run().then((workspace) => { settled = true; return workspace; });
    await flush();
    h.candidates.reject(new Error("offline"));
    await flush();
    h.source.resolve(compact());
    await flush();
    // A failed candidate transport must not wait for a slow priority read.
    expect(settled).toBe(true);
    const workspace = await workspaceRead;
    expect(workspace.focus).toEqual({ date: "2026-10-01", selectedIds: [], selectedTasks: [], candidates: [], available: false });
    expect(h.focusReads()).toHaveLength(1);
    expect(h.selectedReads()).toHaveLength(0);
  });

  it("preserves a fail-fast priority transport error while candidate reads remain pending", async () => {
    const h = harness();
    let settled = false;
    const workspaceRead = h.run().then((workspace) => { settled = true; return workspace; });
    h.source.resolve(compact());
    await flush();
    h.priorities.reject(new Error("offline"));
    await flush();
    expect(settled).toBe(true);
    expect((await workspaceRead).focus).toEqual({ date: "2026-10-01", selectedIds: [], selectedTasks: [], candidates: [], available: false });
    h.candidates.reject(new Error("also offline"));
    await flush();
    expect(h.focusReads()).toHaveLength(1);
  });

  it("preserves selected task hydration when the candidate query returns a database error", async () => {
    const h = harness();
    h.source.resolve(compact());
    h.candidates.resolve({ data: null, error: { message: "unavailable" } });
    h.priorities.resolve(result([{ focus_date: "2026-10-01", task_id: "older", position: 0 }]));
    h.selected.resolve(result([olderSelection]));
    const workspace = await h.run();
    expect(workspace.focus).toEqual({ date: "2026-10-01", selectedIds: ["older"], selectedTasks: [olderSelection], candidates: [], available: false });
    expect(h.selectedReads()).toHaveLength(1);
  });

  it("preserves candidates when date-scoped priorities return a database error", async () => {
    const h = harness();
    h.source.resolve(compact());
    h.candidates.resolve(result([candidate]));
    h.priorities.resolve({ data: null, error: { message: "unavailable" } });
    const workspace = await h.run();
    expect(workspace.focus).toEqual({ date: "2026-10-01", selectedIds: [], selectedTasks: [], candidates: [candidate], available: false });
    expect(h.selectedReads()).toHaveLength(0);
  });

  it("keeps selected IDs and candidate records when a missing selection cannot be loaded", async () => {
    const h = harness();
    h.source.resolve(compact());
    h.candidates.resolve(result([candidate]));
    h.priorities.resolve(result([{ focus_date: "2026-10-01", task_id: "older", position: 0 }, { focus_date: "2026-10-01", task_id: "candidate", position: 1 }]));
    h.selected.resolve({ data: null, error: { message: "unavailable" } });
    const workspace = await h.run();
    expect(workspace.focus).toEqual({ date: "2026-10-01", selectedIds: ["older", "candidate"], selectedTasks: [candidate], candidates: [candidate], available: false });
  });

  it("does not leave a candidate rejection unhandled when sources also fail", async () => {
    const h = harness();
    const workspaceRead = h.run();
    const failedWorkspace = expect(workspaceRead).rejects.toThrow("source offline");
    await flush();
    h.source.reject(new Error("source offline"));
    await failedWorkspace;
    h.candidates.reject(new Error("candidate offline"));
    h.priorities.reject(new Error("priorities offline"));
    await flush();
    expect(h.priorityReads()).toHaveLength(1);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not start any private read before owner authentication succeeds", async () => {
    const h = harness();
    const auth = deferred<Owner>();
    mocks.owner.mockReturnValue(auth.promise);
    const workspaceRead = h.run();
    const failedWorkspace = expect(workspaceRead).rejects.toThrow("unauthenticated");
    await flush();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.reads).toEqual([]);
    auth.reject(new Error("unauthenticated"));
    await failedWorkspace;
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.reads).toEqual([]);
  });

  it("still supports direct focus reads without preloaded candidates", async () => {
    const h = harness();
    const focusRead = getTodayFocus(h.owner, now, "America/Los_Angeles");
    await flush();
    expect(h.focusReads()).toHaveLength(1);
    expect(h.priorityReads()).toHaveLength(1);
    h.candidates.resolve(result([candidate]));
    h.priorities.resolve(result([]));
    expect(await focusRead).toEqual({ date: "2026-10-01", selectedIds: [], selectedTasks: [], candidates: [candidate], available: true });
    expect(mocks.owner).not.toHaveBeenCalled();
  });
});
