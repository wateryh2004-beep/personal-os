import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ near: vi.fn(), full: vi.fn(), queue: vi.fn(), checkpoint: vi.fn(), lastFull: null as string | null }));
vi.mock("@/lib/env", () => ({ env: { cronSecret: "fixture-secret" } }));
vi.mock("@/lib/services/calendar-near-sync", () => ({ drainCalendarSyncQueue: mocks.queue, syncNearCalendar: mocks.near }));
vi.mock("@/lib/services/microsoft-sync-backup", () => ({ syncAndBackupMicrosoftWorkspace: mocks.full }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  let selected = ""; let updated = false;
  const query = {
    select: (value: string) => { selected = value; return query; },
    insert: () => query, update: (value: unknown) => { updated = true; if (table === "calendar_connections") mocks.checkpoint(value); return query; },
    eq: () => query, is: () => query, maybeSingle: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: updated ? null : table === "calendar_sync_cron_runs" ? { id: "run" } : selected === "id,user_id" ? [{ id: "connection", user_id: "owner" }] : { calendar_last_full_reconcile_at: mocks.lastFull }, error: null })),
  }; return query;
} }) }));
import { GET } from "@/app/api/cron/microsoft-backup/route";
import { nextDailyCalendarSync } from "@/features/calendar/scheduler-status";
const request = (token = "fixture-secret") => new NextRequest("https://fixture.example/api/cron/microsoft-backup", { headers: { authorization: `Bearer ${token}` } });
beforeEach(() => {
  mocks.lastFull = null; mocks.checkpoint.mockReset(); mocks.near.mockReset().mockResolvedValue({ skipped: false }); mocks.full.mockReset().mockResolvedValue({ skipped: false }); mocks.queue.mockReset().mockResolvedValue({ processed: 0, failed: 0 });
});
describe("daily calendar job", () => {
  it("rejects unknown callers before database or provider work", async () => { expect((await GET(request("wrong"))).status).toBe(401); expect(mocks.full).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); });
  it("refreshes the calendar even when deep reconciliation is not due", async () => {
    mocks.lastFull = new Date().toISOString(); expect((await GET(request())).status).toBe(200);
    expect(mocks.near).toHaveBeenCalledWith("connection", "owner", "scheduled"); expect(mocks.full).not.toHaveBeenCalled();
  });
  it("runs due full reconciliation and only then saves the checkpoint", async () => {
    expect((await GET(request())).status).toBe(200); expect(mocks.full).toHaveBeenCalled(); expect(mocks.checkpoint).toHaveBeenCalledTimes(1);
  });
  it("never advances full success when another worker holds the lock", async () => {
    mocks.full.mockResolvedValue({ skipped: true }); await GET(request()); expect(mocks.checkpoint).not.toHaveBeenCalled();
  });
  it("preserves a failed import for retry", async () => {
    mocks.full.mockRejectedValue(new Error("fixture failure")); expect((await GET(request())).status).toBe(207); expect(mocks.checkpoint).not.toHaveBeenCalled();
  });
  it("uses the configured UTC schedule rather than manual-run time plus 24h", () => {
    expect(nextDailyCalendarSync(new Date("2026-10-06T14:00:00Z"))).toBe("2026-10-06T23:00:00.000Z");
    expect(nextDailyCalendarSync(new Date("2026-10-06T23:30:00Z"))).toBe("2026-10-07T23:00:00.000Z");
  });
  it("keeps all three daily jobs and does not provision webhook access", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")); expect(config.crons).toHaveLength(3);
    expect(config.crons).toContainEqual({ path: "/api/cron/microsoft-backup", schedule: "0 23 * * *" });
    expect(readFileSync("src/app/api/cron/microsoft-backup/route.ts", "utf8")).not.toContain("ensureCalendarWebhookSubscription");
  });
});
