import { describe, expect, it } from "vitest";
import { layoutTimedEvents } from "@/features/calendar/view-utils";

const event = (id: string, starts_at: string, ends_at: string) => ({ id, starts_at, ends_at, is_all_day: false });

describe("calendar timed event layout", () => {
  it("maps visible duration to the selected daily range", () => {
    const [layout] = layoutTimedEvents([event("one", "2026-08-06T09:00:00+08:00", "2026-08-06T10:30:00+08:00")]);
    expect(layout).toMatchObject({ startMinutes: 540, endMinutes: 630, column: 0, columns: 1 });
  });

  it("lays overlapping events beside each other", () => {
    const layout = layoutTimedEvents([
      event("one", "2026-08-06T09:00:00+08:00", "2026-08-06T11:00:00+08:00"),
      event("two", "2026-08-06T09:30:00+08:00", "2026-08-06T10:00:00+08:00"),
      event("three", "2026-08-06T10:30:00+08:00", "2026-08-06T11:30:00+08:00"),
    ]);
    expect(layout.map(({ column, columns }) => [column, columns])).toEqual([[0, 2], [1, 2], [1, 2]]);
  });

  it("clips events outside the visible 6:00–24:00 range and excludes all-day events", () => {
    const layout = layoutTimedEvents([
      event("early", "2026-08-06T05:00:00+08:00", "2026-08-06T07:00:00+08:00"),
      event("late", "2026-08-06T23:00:00+08:00", "2026-08-07T01:00:00+08:00"),
      { ...event("all-day", "2026-08-06T00:00:00+08:00", "2026-08-07T00:00:00+08:00"), is_all_day: true },
    ]);
    expect(layout.map(({ event: item, startMinutes, endMinutes }) => [item.id, startMinutes, endMinutes])).toEqual([["early", 360, 420], ["late", 1380, 1440]]);
  });
});
