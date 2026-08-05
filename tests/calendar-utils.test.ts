import { describe, expect, it } from "vitest";
import { createCalendarEventSchema } from "@/features/calendar/schemas";
import { calendarPayload, eventForGraph } from "@/features/calendar/utils";

describe("calendar operation payloads", () => {
  const event = {
    subject: "专注写作",
    startsAt: "2026-08-05T09:00:00.000Z",
    endsAt: "2026-08-05T10:00:00.000Z",
    locationName: "书房",
    isAllDay: false,
  };

  it("accepts a valid, UTC-normalized create request", () => {
    expect(createCalendarEventSchema.parse(event)).toEqual(event);
  });

  it("rejects an end time that is not after the start", () => {
    expect(createCalendarEventSchema.safeParse({ ...event, endsAt: event.startsAt }).success).toBe(false);
  });

  it("keeps the queued payload minimal and converts it to Graph's event shape", () => {
    expect(calendarPayload(event)).toEqual(event);
    expect(eventForGraph(event)).toEqual({
      subject: "专注写作",
      start: { dateTime: event.startsAt, timeZone: "UTC" },
      end: { dateTime: event.endsAt, timeZone: "UTC" },
      isAllDay: false,
      location: { displayName: "书房" },
    });
  });
});
