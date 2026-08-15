import { describe, expect, it } from "vitest";
import { calendarSyncOptions, calendarSyncWindow, deltaLinkCarriesSelect, shouldUseCalendarDelta } from "@/features/calendar/sync-policy";

const DAY = 86_400_000;
const now = Date.parse("2026-08-15T04:00:00.000Z");

describe("calendar sync policy", () => {
  it("uses an authoritative full Graph read for manual cache repair", () => {
    expect(calendarSyncOptions("manual")).toEqual({ forceFull: true });
  });

  it("keeps scheduled reconciliation efficient with the delta cursor", () => {
    expect(calendarSyncOptions("scheduled")).toEqual({ forceFull: false });
  });
});

describe("calendar history window", () => {
  it("covers two years of past events so Outlook history is mirrored", () => {
    const window = calendarSyncWindow(now);
    expect(Date.parse(window.start)).toBe(now - 730 * DAY);
    expect(Date.parse(window.end)).toBe(now + 180 * DAY);
  });

  it("falls back to a full sync while the stored window is narrower than the history horizon", () => {
    // 旧代码留下的窗口：只覆盖最近 30 天，未到新的 2 年历史起点 → 必须全量补历史。
    const narrow = {
      calendar_delta_link: "delta",
      calendar_sync_window_start: new Date(now - 30 * DAY).toISOString(),
      calendar_sync_window_end: new Date(now + 180 * DAY).toISOString(),
    };
    expect(shouldUseCalendarDelta(narrow, now, calendarSyncWindow(now).start, false)).toBe(false);
  });

  it("resumes delta once a full sync has widened the stored window", () => {
    const wide = calendarSyncWindow(now);
    const afterFull = { calendar_delta_link: "delta", calendar_sync_window_start: wide.start, calendar_sync_window_end: wide.end };
    expect(shouldUseCalendarDelta(afterFull, now, wide.start, false)).toBe(true);
    expect(shouldUseCalendarDelta(afterFull, now, wide.start, true)).toBe(false);
  });

  it("keeps delta active as time advances after widening, without repeated full syncs", () => {
    const wide = calendarSyncWindow(now);
    const afterFull = { calendar_delta_link: "delta", calendar_sync_window_start: wide.start, calendar_sync_window_end: wide.end };
    const later = now + 30 * DAY;
    // storedStart（全量时刻−730d）≤ later−730d 恒成立，因为全量时刻在过去。
    expect(shouldUseCalendarDelta(afterFull, later, calendarSyncWindow(later).start, false)).toBe(true);
  });

  it("ignores a delta link once the stored window has expired", () => {
    const wide = calendarSyncWindow(now);
    const expired = { calendar_delta_link: "delta", calendar_sync_window_start: wide.start, calendar_sync_window_end: new Date(now + 29 * DAY).toISOString() };
    expect(shouldUseCalendarDelta(expired, now, wide.start, false)).toBe(false);
  });
});

describe("calendar delta cursor field contract", () => {
  it("accepts a delta link created with an explicit field select", () => {
    const deltaLink = "https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=2024-01-01T00%3A00%3A00Z&%24select=id%2Csubject&%24deltatoken=abc";
    expect(deltaLinkCarriesSelect(deltaLink)).toBe(true);
  });

  it("rejects a delta link created without a field select", () => {
    const deltaLink = "https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=2024-01-01T00%3A00%3A00Z&%24deltatoken=abc";
    expect(deltaLinkCarriesSelect(deltaLink)).toBe(false);
  });

  it("rejects a null delta link", () => {
    expect(deltaLinkCarriesSelect(null)).toBe(false);
  });
});
