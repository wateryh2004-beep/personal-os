import { describe, expect, it } from "vitest";
import { calendarRangeKey, filterCalendarEvents, isCurrentCalendarRangeResponse, removeCalendarEvent, replaceCalendarEvent } from "@/features/calendar/client-state";
import type { CalendarEventRecord } from "@/features/calendar/types";

const event = (id: string, categories: string[] = []): CalendarEventRecord => ({
  id, provider_event_id: `provider-${id}`, subject: id, body_text: null,
  starts_at: "2026-08-14T04:00:00.000Z", ends_at: "2026-08-14T05:00:00.000Z",
  is_all_day: false, location_name: null, categories, importance: "normal", show_as: "busy", last_synced_at: "2026-08-14T04:00:00.000Z",
});

describe("calendar client state", () => {
  it("does not allow a stale range response to replace the active one", () => {
    expect(calendarRangeKey("a", "b")).toBe("a:b");
    expect(isCurrentCalendarRangeResponse(2, 1)).toBe(false);
    expect(isCurrentCalendarRangeResponse(2, 2)).toBe(true);
  });

  it("filters the actual fetched event set, not a separate server snapshot", () => {
    const events = [event("work", ["工作"]), event("life", ["生活"]), event("none")];
    expect(filterCalendarEvents(events, new Set(["工作"])).map((item) => item.id)).toEqual(["work"]);
    expect(filterCalendarEvents(events, new Set()).map((item) => item.id)).toEqual(["work", "life", "none"]);
  });

  it("reconciles update and delete mutations into the same visible collection", () => {
    const events = [event("first"), event("second")];
    const updated = { ...events[0], subject: "已改期", starts_at: "2026-08-14T08:00:00.000Z" };
    expect(replaceCalendarEvent(events, updated)[0]).toMatchObject({ subject: "已改期", starts_at: "2026-08-14T08:00:00.000Z" });
    expect(removeCalendarEvent(events, "first").map((item) => item.id)).toEqual(["second"]);
  });
});
