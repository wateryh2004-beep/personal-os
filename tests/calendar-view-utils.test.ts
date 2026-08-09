import { describe, expect, it } from "vitest";
import { layoutTimedEvents, projectEventIntoLocalDays } from "@/features/calendar/view-utils";

const timezone = "Asia/Shanghai";
const event = (id: string, starts_at: string, ends_at: string, is_all_day = false) => ({ id, starts_at, ends_at, is_all_day });
const segments = (...events: ReturnType<typeof event>[]) => events.flatMap((item) => projectEventIntoLocalDays(item, timezone));
const layout = (view: "day" | "week", ...events: ReturnType<typeof event>[]) => layoutTimedEvents(segments(...events), { view, startHour: 6, endHour: 24 });

describe("Calendar 2.0 timed event layout", () => {
  it("uses the full width for an isolated event", () => {
    expect(layout("week", event("one", "2026-08-06T09:00:00+08:00", "2026-08-06T10:30:00+08:00"))[0]).toMatchObject({ startMinutes: 540, endMinutes: 630, lane: 0, laneCount: 1, left: 0, width: 100, layoutMode: "single" });
  });

  it("places two overlapping events in normal columns", () => {
    const items = layout("week", event("one", "2026-08-06T09:00:00+08:00", "2026-08-06T11:00:00+08:00"), event("two", "2026-08-06T09:30:00+08:00", "2026-08-06T10:00:00+08:00"));
    expect(items.map(({ lane, laneCount, layoutMode }) => [lane, laneCount, layoutMode])).toEqual([[0, 2, "columns"], [1, 2, "columns"]]);
  });

  it("keeps three simultaneous week events in non-overlapping columns", () => {
    const items = layout("week", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T11:00:00+08:00"), event("b", "2026-08-06T09:10:00+08:00", "2026-08-06T10:00:00+08:00"), event("c", "2026-08-06T09:20:00+08:00", "2026-08-06T10:30:00+08:00"));
    expect(items.every((item) => item.layoutMode === "columns" && Math.abs(item.width - 100 / 3) < 0.001)).toBe(true);
    expect(items[0].left).toBe(0);
    expect(items[1].left).toBeCloseTo(100 / 3);
    expect(items[2].left).toBeCloseTo(200 / 3);
    for (const left of items) {
      for (const right of items) {
        if (left.event.id >= right.event.id) continue;
        expect(left.left + left.width <= right.left || right.left + right.width <= left.left).toBe(true);
      }
    }
  });

  it("keeps true columns for three simultaneous events in day view", () => {
    const items = layout("day", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T11:00:00+08:00"), event("b", "2026-08-06T09:10:00+08:00", "2026-08-06T10:00:00+08:00"), event("c", "2026-08-06T09:20:00+08:00", "2026-08-06T10:30:00+08:00"));
    expect(items.every((item) => item.layoutMode === "columns" && Math.abs(item.width - 100 / 3) < 0.001)).toBe(true);
  });

  it("does not treat touching boundaries as overlap", () => {
    const items = layout("week", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"), event("b", "2026-08-06T10:00:00+08:00", "2026-08-06T11:00:00+08:00"));
    expect(items.map((item) => [item.clusterId, item.laneCount, item.width])).toEqual([[0, 1, 100], [1, 1, 100]]);
  });

  it("reuses a lane after its event ends", () => {
    const items = layout("day", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"), event("b", "2026-08-06T09:30:00+08:00", "2026-08-06T11:00:00+08:00"), event("c", "2026-08-06T10:00:00+08:00", "2026-08-06T11:30:00+08:00"));
    expect(items.map((item) => item.lane)).toEqual([0, 1, 0]);
  });

  it("reuses one short-event lane beside a long event", () => {
    const items = layout("day", event("long", "2026-08-06T09:00:00+08:00", "2026-08-06T17:00:00+08:00"), event("morning", "2026-08-06T10:00:00+08:00", "2026-08-06T11:00:00+08:00"), event("noon", "2026-08-06T11:30:00+08:00", "2026-08-06T12:30:00+08:00"));
    expect(items.map((item) => [item.event.id, item.lane])).toEqual([["long", 0], ["morning", 1], ["noon", 1]]);
    expect(items.every((item) => item.laneCount === 2)).toBe(true);
  });

  it("handles nested overlaps with a real third lane", () => {
    const items = layout("day", event("outer", "2026-08-06T09:00:00+08:00", "2026-08-06T17:00:00+08:00"), event("middle", "2026-08-06T10:00:00+08:00", "2026-08-06T14:00:00+08:00"), event("inner", "2026-08-06T11:00:00+08:00", "2026-08-06T12:00:00+08:00"));
    expect(items.map((item) => item.lane)).toEqual([0, 1, 2]);
  });

  it("lays out events with the same end time deterministically", () => {
    const items = layout("day", event("early", "2026-08-06T09:00:00+08:00", "2026-08-06T12:00:00+08:00"), event("late", "2026-08-06T10:00:00+08:00", "2026-08-06T12:00:00+08:00"));
    expect(items.map((item) => [item.event.id, item.lane, item.laneCount])).toEqual([["early", 0, 2], ["late", 1, 2]]);
  });

  it("expands into an unused lane when later collisions permit it", () => {
    const items = layout("day", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T12:00:00+08:00"), event("b", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"), event("c", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"), event("d", "2026-08-06T10:00:00+08:00", "2026-08-06T11:00:00+08:00"));
    const expanded = items.find((item) => item.event.id === "d")!;
    expect(expanded).toMatchObject({ lane: 1, laneCount: 3, laneSpan: 2 });
    expect(expanded.width).toBeCloseTo(200 / 3);
  });

  it("clips early and late events to the visible range", () => {
    const items = layout("week", event("early", "2026-08-06T05:00:00+08:00", "2026-08-06T07:00:00+08:00"), event("late", "2026-08-06T23:00:00+08:00", "2026-08-07T01:00:00+08:00"));
    expect(items.map(({ event: item, startMinutes, endMinutes, clippedBefore, clippedAfter, continuesAfter }) => [item.id, startMinutes, endMinutes, clippedBefore, clippedAfter, continuesAfter])).toEqual([["early", 360, 420, true, false, false], ["late", 1380, 1440, false, false, true]]);
  });

  it("excludes all-day events from the timed lane engine", () => {
    expect(layout("week", event("all", "2026-08-06T00:00:00+08:00", "2026-08-07T00:00:00+08:00", true))).toEqual([]);
  });

  it("segments a cross-midnight event across both local days", () => {
    const projected = projectEventIntoLocalDays(event("late", "2026-08-06T23:00:00+08:00", "2026-08-07T01:00:00+08:00"), timezone);
    expect(projected.map(({ dateKey, startMinutes, endMinutes }) => [dateKey, startMinutes, endMinutes])).toEqual([["2026-08-06", 1380, 1440], ["2026-08-07", 0, 60]]);
  });

  it("marks continuation direction on cross-day segments", () => {
    const projected = projectEventIntoLocalDays(event("late", "2026-08-06T23:00:00+08:00", "2026-08-07T01:00:00+08:00"), timezone);
    expect(projected.map(({ continuesBefore, continuesAfter }) => [continuesBefore, continuesAfter])).toEqual([[false, true], [true, false]]);
  });

  it("is stable when events share exactly the same start and end", () => {
    const items = layout("day", event("a", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"), event("b", "2026-08-06T09:00:00+08:00", "2026-08-06T10:00:00+08:00"));
    expect(items.map((item) => [item.event.id, item.lane])).toEqual([["a", 0], ["b", 1]]);
  });
});
