import { describe, expect, it } from "vitest";
import { dateTimeInputValue, fullCalendarDateToInstant, instantToDate, instantToFullCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";

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
});
