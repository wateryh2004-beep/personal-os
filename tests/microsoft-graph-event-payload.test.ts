import { describe, expect, it } from "vitest";
import { calendarEventForGraph } from "@/lib/adapters/microsoft-graph/event-payload";

describe("calendarEventForGraph", () => {
  it("creates an all-day event with midnight boundaries in one Graph time zone", () => {
    const event = calendarEventForGraph({
      subject: "上映", description: null, startsAt: "2026-08-11T00:00:00+08:00", endsAt: "2026-08-11T23:59:59+08:00", locationName: null, isAllDay: true, timeZone: "Asia/Shanghai",
    });
    expect(event).toMatchObject({
      start: { dateTime: "2026-08-11T00:00:00", timeZone: "China Standard Time" },
      end: { dateTime: "2026-08-12T00:00:00", timeZone: "China Standard Time" },
      isAllDay: true,
    });
  });

  it("keeps timed events in the configured local Graph time zone", () => {
    const event = calendarEventForGraph({
      subject: "会议", description: null, startsAt: "2026-08-11T14:00:00+08:00", endsAt: "2026-08-11T15:00:00+08:00", locationName: null, isAllDay: false, timeZone: "Asia/Shanghai",
    });
    expect(event.start).toEqual({ dateTime: "2026-08-11T14:00:00", timeZone: "China Standard Time" });
    expect(event.end).toEqual({ dateTime: "2026-08-11T15:00:00", timeZone: "China Standard Time" });
  });
});
