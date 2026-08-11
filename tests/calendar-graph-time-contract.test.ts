import { describe, expect, it } from "vitest";
import { calendarEventForGraph } from "@/lib/adapters/microsoft-graph/event-payload";

describe("Calendar Graph time boundary", () => {
  it("sends the same Singapore wall time that the UTC instant represents", () => {
    const graph = calendarEventForGraph({ subject: "午间会议", description: null, startsAt: "2026-08-11T04:00:00.000Z", endsAt: "2026-08-11T05:00:00.000Z", locationName: null, isAllDay: false, timeZone: "Asia/Singapore" });
    expect(graph.start).toEqual({ dateTime: "2026-08-11T12:00:00", timeZone: "Singapore Standard Time" });
    expect(graph.end).toEqual({ dateTime: "2026-08-11T13:00:00", timeZone: "Singapore Standard Time" });
  });

  it("uses an exclusive next DATE for an all-day event", () => {
    const graph = calendarEventForGraph({ subject: "全天", description: null, startsAt: "2026-08-10T16:00:00.000Z", endsAt: "2026-08-11T16:00:00.000Z", locationName: null, isAllDay: true, timeZone: "Asia/Shanghai" });
    expect(graph.start).toEqual({ dateTime: "2026-08-11T00:00:00", timeZone: "China Standard Time" });
    expect(graph.end).toEqual({ dateTime: "2026-08-12T00:00:00", timeZone: "China Standard Time" });
  });
});
