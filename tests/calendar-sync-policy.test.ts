import { describe, expect, it } from "vitest";
import { calendarSyncOptions } from "@/features/calendar/sync-policy";

describe("calendar sync policy", () => {
  it("uses an authoritative full Graph read for manual cache repair", () => {
    expect(calendarSyncOptions("manual")).toEqual({ forceFull: true });
  });

  it("keeps scheduled reconciliation efficient with the delta cursor", () => {
    expect(calendarSyncOptions("scheduled")).toEqual({ forceFull: false });
  });
});
