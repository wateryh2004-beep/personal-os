import { describe, expect, it } from "vitest";
import { deleteCalendarEventSchema, updateCalendarEventSchema } from "@/features/calendar/schemas";

describe("Calendar AI proposal schemas", () => {
  const existing = { providerEventId: "provider-1", originalSubject: "理发", originalStartsAt: "2026-08-08T16:00:00+08:00", originalEndsAt: "2026-08-08T17:00:00+08:00" };

  it("accepts an in-place reschedule with explicit Beijing offset", () => {
    const parsed = updateCalendarEventSchema.safeParse({ ...existing, subject: "理发", startsAt: "2026-08-09T16:00:00+08:00", endsAt: "2026-08-09T17:00:00+08:00", locationName: "燕郊", isAllDay: false });
    expect(parsed.success).toBe(true);
  });

  it("preserves all-day semantics for delete confirmation", () => {
    const parsed = deleteCalendarEventSchema.parse({ providerEventId: "provider-2", subject: "看电影", startsAt: "2026-08-08T00:00:00+08:00", endsAt: "2026-08-09T00:00:00+08:00", isAllDay: true });
    expect(parsed.isAllDay).toBe(true);
  });
});
