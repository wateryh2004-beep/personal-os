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

  it("includes Outlook categories and availability only when explicitly supplied", () => {
    const event = calendarEventForGraph({
      subject: "华夏基金实习", description: null, startsAt: "2026-08-11T08:30:00+08:00", endsAt: "2026-08-11T17:00:00+08:00", locationName: null, isAllDay: false, timeZone: "Asia/Shanghai", categories: ["领域·实习/工作", "场景·华夏基金"], importance: "high", showAs: "busy",
    });
    expect(event).toMatchObject({ categories: ["领域·实习/工作", "场景·华夏基金"], importance: "high", showAs: "busy" });
  });

  it("omits categories from update-style payloads so Graph preserves them", () => {
    const event = calendarEventForGraph({ subject: "仅改标题", description: null, startsAt: "2026-08-11T08:30:00+08:00", endsAt: "2026-08-11T09:00:00+08:00", locationName: null, isAllDay: false });
    expect(event).not.toHaveProperty("categories");
  });
});
