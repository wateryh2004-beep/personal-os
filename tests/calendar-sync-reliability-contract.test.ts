import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nearCalendarWindow } from "@/lib/services/calendar-near-sync";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("reliable Outlook calendar sync", () => {
  it("uses a bounded near-term window instead of the deep reconciliation range", () => {
    const window = nearCalendarWindow(new Date("2026-08-22T00:00:00.000Z"));
    expect(window.start).toBe("2026-08-08T00:00:00.000Z");
    expect(window.end).toBe("2026-10-21T00:00:00.000Z");
  });

  it("persists runs, an idempotent worker queue, and subscription safety boundaries", () => {
    const migration = read("supabase/migrations/20260822040252_calendar_sync_reliability.sql");
    expect(migration).toContain("calendar_sync_runs");
    expect(migration).toContain("calendar_sync_queue");
    expect(migration).toContain("calendar_sync_runs_one_active_per_connection_idx");
    expect(migration).toContain("calendar_webhook_state_ciphertext");
    expect(migration).toContain("enable row level security");
  });

  it("keeps webhook input out of sync logic and validates client state before queuing", () => {
    const webhook = read("src/app/api/webhooks/microsoft/calendar/route.ts");
    expect(webhook).toContain("validationToken");
    expect(webhook).toContain("expected !== notification.clientState");
    expect(webhook).toContain("enqueueCalendarSync");
    expect(webhook).toContain("after(() => drainCalendarSyncQueue");
    expect(webhook).toContain("subscriptionRemoved");
    expect(webhook).toContain("reauthorizationRequired");
    expect(webhook).toContain("calendar_subscription_id: null");
  });

  it("uses one durable run lock for near and deep synchronization", () => {
    const nearSync = read("src/lib/services/calendar-near-sync.ts");
    const deepSync = read("src/lib/services/microsoft-sync-backup.ts");
    expect(nearSync).toContain("startCalendarSyncRun");
    expect(deepSync).toContain("calendar_sync_in_progress");
    expect(deepSync).toContain("startCalendarSyncRun(userId, connectionId, trigger, \"full_reconcile\")");
    expect(nearSync).toContain("available_at: new Date(Date.now() + 20_000)");
  });

  it("never treats connection last_seen_at as calendar freshness", () => {
    const query = read("src/features/calendar/queries.ts");
    expect(query).not.toContain("last_seen_at");
    expect(query).toContain("calendar_last_delta_sync_at");
  });
});
