import { describe, expect, it } from "vitest";
import { taskDueInputToIso, taskDueInputValue } from "@/features/tasks/due-time";

describe("task deadline form boundary", () => {
  it.each([
    ["Asia/Shanghai", "2026-10-06T00:30", "2026-10-05T16:30:00.000Z"],
    ["America/New_York", "2026-01-12T09:45", "2026-01-12T14:45:00.000Z"],
    ["America/New_York", "2026-07-12T09:45", "2026-07-12T13:45:00.000Z"],
    ["America/New_York", "2026-03-08T01:30", "2026-03-08T06:30:00.000Z"],
    ["America/New_York", "2026-03-08T03:30", "2026-03-08T07:30:00.000Z"],
  ])("round-trips the user's wall time in %s: %s", (timezone, wallTime, instant) => {
    expect(taskDueInputValue(instant, timezone)).toBe(wallTime);
    expect(taskDueInputToIso(wallTime, timezone)).toBe(instant);
  });

  it("keeps an empty deadline empty", () => {
    expect(taskDueInputValue(null, "Asia/Shanghai")).toBe("");
    expect(taskDueInputToIso("", "America/New_York")).toBeNull();
  });

  it("rejects invalid dates and DST gaps or overlaps instead of moving a deadline", () => {
    expect(() => taskDueInputToIso("2026-02-30T10:00", "Asia/Shanghai")).toThrow();
    expect(() => taskDueInputToIso("2026-03-08T02:30", "America/New_York")).toThrow("calendar_wall_time_nonexistent");
    expect(() => taskDueInputToIso("2026-11-01T01:30", "America/New_York")).toThrow("calendar_wall_time_ambiguous");
  });
});
