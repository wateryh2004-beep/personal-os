import { describe, expect, it } from "vitest";
import { domainContracts, retryAfter, safeErrorSummary, stateForSnapshot, systemDomains, type SystemStatusAdapter } from "@/features/system-status/contracts";

describe("unified system status contracts", () => {
  it("defines authority and replication for every supported operational domain", () => {
    expect(systemDomains).toEqual(["tasks", "calendar", "notes", "files", "briefing", "ai"]);
    expect(domainContracts.tasks.authoritySource).toBe("Microsoft To Do");
    expect(domainContracts.calendar.authoritySource).toBe("Outlook Calendar");
    expect(domainContracts.notes.syncDirection).toBe("none");
    const adapter: SystemStatusAdapter<string, string> = { domain: "files", execute: async (value) => value, describeFailure: () => ({ code: "offline", summary: "第三方暂不可用", retryable: true }) };
    expect(adapter.describeFailure(new Error("offline")).retryable).toBe(true);
  });

  it("uses conflict and unavailable before freshness, then marks aged replicas stale", () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    expect(stateForSnapshot({ now, hasConflict: true })).toBe("conflict");
    expect(stateForSnapshot({ now, unavailable: true })).toBe("unavailable");
    expect(stateForSnapshot({ now, lastSuccessAt: "2026-08-21T08:00:00.000Z", refreshIntervalSeconds: 900 })).toBe("stale");
    expect(stateForSnapshot({ now, lastSuccessAt: "2026-08-21T09:50:00.000Z", refreshIntervalSeconds: 900 })).toBe("fresh");
  });

  it("caps retry backoff and strips likely secrets and URLs from event summaries", () => {
    expect(retryAfter(1, new Date("2026-08-21T10:00:00.000Z"))).toBe("2026-08-21T10:00:30.000Z");
    expect(retryAfter(20, new Date("2026-08-21T10:00:00.000Z"))).toBe("2026-08-21T11:00:00.000Z");
    expect(retryAfter(2, new Date("2026-08-21T10:00:00.000Z"))).toBe("2026-08-21T10:01:00.000Z");
    expect(safeErrorSummary("failed https://example.com/a?token=abcdefghijklmnoabcdefghijklmno")).toContain("[url]");
  });

  it("preserves a conflict or outage as a terminal visible state for the current attempt", () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    expect(stateForSnapshot({ now, hasFailure: true, hasConflict: true })).toBe("conflict");
    expect(stateForSnapshot({ now, hasFailure: true, unavailable: true })).toBe("unavailable");
  });
});
