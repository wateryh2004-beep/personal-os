import { describe, expect, it } from "vitest";
import {
  calendarCapacityComplete,
  hasCanonicalAllDayAnchors,
  calculateCapacity,
} from "@/features/planning/capacity";
import { tripTimeOverlaps } from "@/features/travel/timeline";
import {
  remainingLeisureTime,
  matchesLeisureContext,
  emptyLeisureContext,
} from "@/features/leisure/presentation";
import { readLeisureBrowse } from "@/features/leisure/browse";
import type { LeisureSummary } from "@/features/leisure/types";
const item: LeisureSummary = {
  id: "synthetic",
  title: "Synthetic film",
  kind: "film",
  why: "",
  how_to_start: null,
  duration_minutes: 120,
  platform: null,
  location: null,
  starts_at: null,
  cost_text: null,
  setting: "home",
  company: "solo",
  budget: "free",
  content_revision: 1,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  feedback: {
    status: "current",
    progress_unit: "minute",
    progress_value: 90,
    progress_total: 120,
    reaction: "none",
    personal_note: "",
    linked_note_id: null,
    linked_note_title: null,
    linked_note_available: false,
    revision: 1,
    updated_at: "2026-10-27T00:00:00Z",
  },
};
describe("known remaining time", () => {
  it("offers a 120 minute experience with 90 recorded minutes in a 30 minute slot without completing it", () => {
    expect(remainingLeisureTime(item)).toEqual({
      state: "known",
      minutes: 30,
      continuing: true,
    });
    expect(
      matchesLeisureContext(item, { ...emptyLeisureContext, minutes: "30" }),
    ).toBe(true);
    expect(item.feedback?.status).toBe("current");
  });
  it("does not infer minutes from page/episode or an inconsistent counter", () => {
    for (const progress_unit of ["page", "episode"] as const)
      expect(
        remainingLeisureTime({
          ...item,
          feedback: { ...item.feedback!, progress_unit },
        }).state,
      ).toBe("unknown");
    expect(
      remainingLeisureTime({
        ...item,
        feedback: { ...item.feedback!, progress_value: 121 },
      }).state,
    ).toBe("unknown");
    expect(remainingLeisureTime({ ...item, kind: "series" }).state).toBe(
      "unknown",
    );
  });
  it("supports a bounded custom slot and keeps malformed values out of return URLs", () => {
    expect(
      readLeisureBrowse(new URLSearchParams("minutes=37")).context.minutes,
    ).toBe("37");
    for (const value of ["0", "-1", "1.5", "1441", "Infinity", "37&create=1"])
      expect(
        readLeisureBrowse(new URLSearchParams({ minutes: value })).context
          .minutes,
      ).toBe("");
  });
});
describe("capacity from complete calendar intersections", () => {
  const periods = [
    { start: "09:00", end: "12:00" },
    { start: "14:00", end: "17:00" },
  ];
  const events = [
    {
      starts_at: "2026-10-27T01:00:00Z",
      ends_at: "2026-10-27T03:00:00Z",
      show_as: "busy",
    },
    {
      starts_at: "2026-10-27T02:00:00Z",
      ends_at: "2026-10-27T04:00:00Z",
      show_as: "tentative",
    },
    {
      starts_at: "2026-10-27T06:00:00Z",
      ends_at: "2026-10-27T09:00:00Z",
      show_as: "free",
    },
  ];
  it("merges overlapping busy events and excludes explicitly free events", () => {
    expect(
      calculateCapacity(
        "2026-10-27",
        "Asia/Shanghai",
        periods,
        events,
        [{ estimated_minutes: 240 }, { estimated_minutes: null }],
        true,
      ),
    ).toEqual({
      available: 360,
      busy: 180,
      free: 180,
      estimated: 240,
      unknown: 1,
      overbooked: 60,
    });
  });
  it("never claims empty or available time from a truncated/unavailable calendar", () => {
    expect(
      calculateCapacity(
        "2026-10-27",
        "Asia/Shanghai",
        periods,
        [],
        [{ estimated_minutes: 30 }],
        false,
      ),
    ).toMatchObject({
      busy: null,
      free: null,
      overbooked: null,
      estimated: 30,
    });
  });
  it("uses actual instants through DST rather than nominal wall-clock duration", () => {
    expect(
      calculateCapacity(
        "2026-11-01",
        "America/New_York",
        [{ start: "00:00", end: "03:00" }],
        [],
        [],
        true,
      ).available,
    ).toBe(240);
    expect(() =>
      calculateCapacity(
        "2026-03-08",
        "America/New_York",
        [{ start: "02:30", end: "04:00" }],
        [],
        [],
        true,
      ),
    ).toThrow();
  });
});
it("reports only known travel overlaps including a stop continuing across midnight", () => {
  expect(
    tripTimeOverlaps([
      { id: "a", day_number: 1, planned_time: "23:30", duration_minutes: 90 },
      { id: "b", day_number: 2, planned_time: "00:30", duration_minutes: 60 },
      { id: "c", day_number: 2, planned_time: null, duration_minutes: 60 },
      {
        id: "d",
        day_number: null,
        planned_time: "00:30",
        duration_minutes: 60,
      },
    ]),
  ).toEqual([{ first: "a", second: "b", minutes: 30 }]);
});

it("treats local-midnight all-day spans as DATE semantics and rejects a timezone-misaligned legacy anchor", () => {
  const event = {
    starts_at: "2026-10-26T16:00:00Z",
    ends_at: "2026-10-27T16:00:00Z",
    show_as: "busy",
    is_all_day: true,
  };
  expect(hasCanonicalAllDayAnchors([event], "Asia/Shanghai")).toBe(true);
  expect(
    calculateCapacity(
      "2026-10-27",
      "Asia/Shanghai",
      [{ start: "09:00", end: "17:00" }],
      [event],
      [],
      true,
    ).free,
  ).toBe(0);
  expect(
    hasCanonicalAllDayAnchors(
      [{ ...event, starts_at: "2026-10-27T00:00:00Z" }],
      "Asia/Shanghai",
    ),
  ).toBe(false);
});
it("requires a nonfuture recent sync, full range coverage and canonical all-day rows before claiming free time", () => {
  const now = Date.parse("2026-10-27T00:00:00Z"),
    connection = {
      status: "enabled",
      last_error_code: null,
      last_sync_at: new Date(now - 1000).toISOString(),
      calendar_sync_window_start: "2026-01-01T00:00:00Z",
      calendar_sync_window_end: "2027-01-01T00:00:00Z",
    };
  const check = (c: typeof connection | null, canonical = true) =>
    calendarCapacityComplete(
      c,
      "2026-10-27T00:00:00Z",
      "2026-10-28T00:00:00Z",
      0,
      canonical,
      now,
      3600000,
    );
  expect(check(connection)).toBe(true);
  expect(check(null)).toBe(false);
  expect(check({ ...connection, last_sync_at: "invalid" })).toBe(false);
  expect(
    check({
      ...connection,
      last_sync_at: new Date(now - 3600001).toISOString(),
    }),
  ).toBe(false);
  expect(
    check({ ...connection, last_sync_at: new Date(now + 1000).toISOString() }),
  ).toBe(false);
  expect(check(connection, false)).toBe(false);
});
