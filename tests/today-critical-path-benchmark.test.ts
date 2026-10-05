import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getTodayWorkspace } from "@/features/today/queries";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/features/proactive/service", () => ({ reconcileProactiveInsights: vi.fn() }));

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Synthetic equal-RTT workload, not production response time or cold-start proof.
 * This exact harness can also run against the pre-change implementation using
 * PERF_BASELINE=1. There are no external requests or database writes.
 */
it("keeps independent Today reads in one latency wave", async () => {
  const start = Date.now();
  const trace: { read: string; startedAtMs: number; endedAtMs?: number }[] = [];
  const delayed = (read: string, data: unknown) => {
    const span = { read, startedAtMs: Date.now() - start, endedAtMs: undefined as number | undefined };
    trace.push(span);
    return new Promise((resolve) => setTimeout(() => {
      span.endedAtMs = Date.now() - start;
      resolve({ data, error: null });
    }, 120));
  };
  const supabase = {
    rpc: () => delayed("workspace-rpc", {
      timezone: "Asia/Shanghai", tasks: [], events: [], connection: null, milestones: [],
      inbox_count: 0, weekly_review_completed: true, due_decisions: [], briefing_date: null, briefing_entries: [],
    }),
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "neq", "order", "limit", "gte", "lte"]) {
        builder[method] = () => builder;
      }
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => delayed(table, []).then(resolve, reject);
      return builder;
    },
  };
  mocks.owner.mockResolvedValue({ supabase, userId: "synthetic-owner", email: "owner@example.test" });
  const read = getTodayWorkspace(new Date("2026-10-02T00:30:00Z"));
  await vi.runAllTimersAsync();
  const workspace = await read;
  const elapsedMs = Date.now() - start;
  const baseline = process.env.PERF_BASELINE === "1";
  expect(elapsedMs).toBe(baseline ? 240 : 120);
  expect(trace).toHaveLength(3);
  expect(trace.find((span) => span.read === "today_task_priorities")?.startedAtMs).toBe(baseline ? 120 : 0);
  expect(workspace.focus?.available).toBe(true);
  expect(mocks.owner).toHaveBeenCalledTimes(1);
  expect(mocks.after).toHaveBeenCalledTimes(1);
  console.info(JSON.stringify({ kind: "synthetic-read-waterfall", baseline, latencyPerReadMs: 120, elapsedMs, trace }));
});
