import { describe, expect, it } from "vitest";
import { calendarEventForGraph } from "@/lib/adapters/microsoft-graph/event-payload";
import { graphDateTimeTimeZoneToDate, graphDateTimeTimeZoneToInstant, graphEventRecord } from "@/lib/adapters/microsoft-graph/calendar";
import { fullCalendarDateToInstant, instantToFullCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import { updateCalendarEventSchema } from "@/features/calendar/schemas";
import { calendarUpdatePayload } from "@/features/calendar/utils";

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

  it("round-trips 12:00 Asia/Shanghai through Graph and the local mirror without a +8h shift", () => {
    const startsAt = wallTimeToIso("2026-08-14T12:00", "Asia/Shanghai");
    const endsAt = wallTimeToIso("2026-08-14T13:30", "Asia/Shanghai");
    expect(startsAt).toBe("2026-08-14T04:00:00.000Z");
    expect(endsAt).toBe("2026-08-14T05:30:00.000Z");

    const outbound = calendarEventForGraph({ subject: "午间会议", description: null, startsAt, endsAt, locationName: null, isAllDay: false, timeZone: "Asia/Shanghai" });
    expect(outbound.start).toEqual({ dateTime: "2026-08-14T12:00:00", timeZone: "China Standard Time" });
    expect(outbound.end).toEqual({ dateTime: "2026-08-14T13:30:00", timeZone: "China Standard Time" });

    const record = graphEventRecord({ id: "event-12", subject: "午间会议", start: outbound.start, end: outbound.end }, "user-1");
    expect(record.starts_at).toBe(startsAt);
    expect(record.ends_at).toBe(endsAt);
    expect(fullCalendarDateToInstant(instantToFullCalendarDate(record.starts_at, "Asia/Shanghai"), "Asia/Shanghai")).toBe(startsAt);
  });

  it.each([
    [{ dateTime: "2026-08-14T04:00:00.0000000", timeZone: "UTC" }],
    [{ dateTime: "2026-08-14T12:00:00.0000000", timeZone: "China Standard Time" }],
    [{ dateTime: "2026-08-14T04:00:00.000Z", timeZone: "China Standard Time" }],
    [{ dateTime: "2026-08-14T12:00:00+08:00", timeZone: "UTC" }],
  ])("canonicalizes Graph DateTimeTimeZone responses", (value) => {
    expect(graphDateTimeTimeZoneToInstant(value)).toBe("2026-08-14T04:00:00.000Z");
  });

  it("refuses a Graph wall time whose timezone cannot be interpreted", () => {
    expect(() => graphDateTimeTimeZoneToInstant({ dateTime: "2026-08-14T12:00:00", timeZone: "Mars Standard Time" })).toThrow("graph_event_timezone_unsupported");
  });

  it("keeps a multi-day all-day event's exclusive end date at the Graph boundary", () => {
    const graph = calendarEventForGraph({ subject: "旅行", description: null, startsAt: "2026-08-13T16:00:00.000Z", endsAt: "2026-08-15T16:00:00.000Z", locationName: null, isAllDay: true, timeZone: "Asia/Shanghai" });
    expect(graph.start).toEqual({ dateTime: "2026-08-14T00:00:00", timeZone: "China Standard Time" });
    expect(graph.end).toEqual({ dateTime: "2026-08-16T00:00:00", timeZone: "China Standard Time" });
  });

  it("keeps Graph all-day DATE values stable in a west-of-UTC profile", () => {
    const record = graphEventRecord({
      id: "new-york-all-day",
      subject: "全天活动",
      isAllDay: true,
      start: { dateTime: "2026-08-14T00:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-08-15T00:00:00.0000000", timeZone: "UTC" },
    }, "user-1", undefined, "America/New_York");
    expect(record.starts_at).toBe("2026-08-14T04:00:00.000Z");
    expect(record.ends_at).toBe("2026-08-15T04:00:00.000Z");
    expect(graphDateTimeTimeZoneToDate({ dateTime: "2026-08-14T00:00:00Z", timeZone: "UTC" })).toBe("2026-08-14");
  });

  it("round-trips a Shanghai update through its operation payload, Graph response, mirror, and FullCalendar", () => {
    const originalStart = wallTimeToIso("2026-08-14T12:00", "Asia/Shanghai");
    const originalEnd = wallTimeToIso("2026-08-14T13:30", "Asia/Shanghai");
    const update = updateCalendarEventSchema.parse({
      providerEventId: "event-update",
      originalSubject: "午间会议",
      originalStartsAt: originalStart,
      originalEndsAt: originalEnd,
      subject: "下午会议",
      startsAt: wallTimeToIso("2026-08-14T14:00", "Asia/Shanghai"),
      endsAt: wallTimeToIso("2026-08-14T15:30", "Asia/Shanghai"),
      isAllDay: false,
      preserveCategories: true,
    });
    const operationPayload = calendarUpdatePayload(update, {
      categories: ["领域·学习"], body_text: null, location_name: null,
      is_all_day: false, importance: "normal", show_as: "busy",
    });
    const outbound = calendarEventForGraph({ ...operationPayload, timeZone: "Asia/Shanghai" });
    expect(outbound.start).toEqual({ dateTime: "2026-08-14T14:00:00", timeZone: "China Standard Time" });
    expect(outbound.end).toEqual({ dateTime: "2026-08-14T15:30:00", timeZone: "China Standard Time" });
    const record = graphEventRecord({
      id: "event-update", subject: "下午会议",
      start: { dateTime: "2026-08-14T06:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-08-14T07:30:00.0000000", timeZone: "UTC" },
    }, "user-1");
    expect(record.starts_at).toBe("2026-08-14T06:00:00.000Z");
    expect(record.ends_at).toBe("2026-08-14T07:30:00.000Z");
    expect(instantToFullCalendarDate(record.starts_at, "Asia/Shanghai").toISOString()).toBe("2026-08-14T14:00:00.000Z");
    expect(fullCalendarDateToInstant(instantToFullCalendarDate(record.ends_at, "Asia/Shanghai"), "Asia/Shanghai")).toBe(record.ends_at);
  });
});
