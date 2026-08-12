import { describe, expect, it } from "vitest";
import { dateTimeInputValue, fullCalendarDateToInstant, instantToDate, instantToFullCalendarDate, shiftCalendarCursor, wallTimeToIso } from "@/features/calendar/timezone";

describe("calendar timezone conversion", () => {
  it("stores Beijing wall time as the correct instant", () => {
    expect(wallTimeToIso("2026-08-08T14:10", "Asia/Shanghai")).toBe("2026-08-08T06:10:00.000Z");
    expect(dateTimeInputValue("2026-08-08T06:10:00.000Z", "Asia/Shanghai")).toBe("2026-08-08T14:10");
  });

  it("does not depend on the browser timezone", () => {
    expect(wallTimeToIso("2026-08-09T16:00", "Asia/Tokyo")).toBe("2026-08-09T07:00:00.000Z");
  });

  it("round-trips FullCalendar's UTC-coerced wall-time boundary", () => {
    const instant = "2026-08-11T04:00:00.000Z";
    const fullCalendarDate = instantToFullCalendarDate(instant, "Asia/Singapore");
    expect(fullCalendarDate.toISOString()).toBe("2026-08-11T12:00:00.000Z");
    expect(fullCalendarDateToInstant(fullCalendarDate, "Asia/Singapore")).toBe(instant);
  });

  it("handles a DST timezone without guessing an ambiguous or nonexistent wall time", () => {
    expect(wallTimeToIso("2026-03-08T01:30", "America/New_York")).toBe("2026-03-08T06:30:00.000Z");
    expect(() => wallTimeToIso("2026-03-08T02:30", "America/New_York")).toThrow("calendar_wall_time_nonexistent");
    expect(() => wallTimeToIso("2026-11-01T01:30", "America/New_York")).toThrow("calendar_wall_time_ambiguous");
  });

  it("preserves all-day dates as DATE semantics instead of UTC midnight", () => {
    const localMidnight = wallTimeToIso("2026-08-11T00:00", "Asia/Shanghai");
    expect(instantToDate(localMidnight, "Asia/Shanghai")).toBe("2026-08-11");
  });

  it.each([
    ["2026-08-11T00:15", "2026-08-10T16:15:00.000Z"],
    ["2026-08-11T05:40", "2026-08-10T21:40:00.000Z"],
    ["2026-08-11T08:30", "2026-08-11T00:30:00.000Z"],
    ["2026-08-11T17:00", "2026-08-11T09:00:00.000Z"],
    ["2026-08-11T23:45", "2026-08-11T15:45:00.000Z"],
  ])("round-trips the boundary time %s", (wallTime, instant) => {
    expect(wallTimeToIso(wallTime, "Asia/Singapore")).toBe(instant);
    expect(dateTimeInputValue(instant, "Asia/Singapore")).toBe(wallTime);
  });

  it.each([
    ["Asia/Shanghai", "2026-08-14T12:00", "2026-08-14T04:00:00.000Z"],
    ["Asia/Singapore", "2026-08-14T12:00", "2026-08-14T04:00:00.000Z"],
    ["Asia/Tokyo", "2026-08-14T12:00", "2026-08-14T03:00:00.000Z"],
    ["America/New_York", "2026-08-14T12:00", "2026-08-14T16:00:00.000Z"],
  ])("keeps profile timezone wall time stable for %s", (timezone, wallTime, instant) => {
    expect(wallTimeToIso(wallTime, timezone)).toBe(instant);
    expect(dateTimeInputValue(instant, timezone)).toBe(wallTime);
  });

  it("moves a cursor using the profile timezone rather than browser-local Date fields", () => {
    const cursor = new Date("2026-08-13T16:30:00.000Z"); // Aug 14 00:30 Shanghai
    expect(shiftCalendarCursor(cursor, "Asia/Shanghai", 1).toISOString()).toBe("2026-08-14T16:30:00.000Z");
  });
});
