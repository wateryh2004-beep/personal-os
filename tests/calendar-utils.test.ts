import { describe, expect, it } from "vitest";
import { createCalendarEventSchema, deleteCalendarEventSchema } from "@/features/calendar/schemas";
import { calendarPayload } from "@/features/calendar/utils";

describe("calendar operation payloads", () => {
  const event = {
    subject: "专注写作",
    description: "完成第一稿，并整理待确认的问题。",
    startsAt: "2026-08-05T09:00:00.000Z",
    endsAt: "2026-08-05T10:00:00.000Z",
    locationName: "书房",
    isAllDay: false,
  };

  it("accepts a valid, UTC-normalized create request", () => {
    expect(createCalendarEventSchema.parse(event)).toMatchObject({ ...event, importance: "normal", showAs: "busy", classificationMode: "auto" });
    expect(createCalendarEventSchema.parse({ ...event, description: "" }).description).toBeNull();
  });

  it("rejects an end time that is not after the start", () => {
    expect(createCalendarEventSchema.safeParse({ ...event, endsAt: event.startsAt }).success).toBe(false);
  });

  it("accepts only one explicit event for deletion", () => {
    expect(deleteCalendarEventSchema.parse({ providerEventId: "event-123", subject: event.subject, startsAt: event.startsAt, endsAt: event.endsAt })).toMatchObject({ providerEventId: "event-123" });
    expect(deleteCalendarEventSchema.safeParse({ providerEventId: "", subject: event.subject, startsAt: event.startsAt, endsAt: event.endsAt }).success).toBe(false);
    expect(deleteCalendarEventSchema.safeParse({ providerEventId: ["event-1", "event-2"], subject: event.subject, startsAt: event.startsAt, endsAt: event.endsAt }).success).toBe(false);
  });

  it("keeps the queued payload provider-neutral", () => {
    const parsed = createCalendarEventSchema.parse(event);
    expect(calendarPayload(parsed)).toMatchObject({ ...event, categories: [], importance: "normal", showAs: "busy" });
  });
});
