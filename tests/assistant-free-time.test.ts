import { describe, expect, it } from "vitest";
import { findFreeTimeSlots } from "@/features/assistant/free-time";

describe("findFreeTime", () => {
  it("calculates slots in the owner timezone without treating Beijing wall time as UTC", () => {
    const slots = findFreeTimeSlots({
      startsAt: "2026-08-10T00:00:00+08:00",
      endsAt: "2026-08-11T00:00:00+08:00",
      durationMinutes: 120,
      timezone: "Asia/Shanghai",
      workingHours: { startsAt: "18:00", endsAt: "22:00" },
      busy: [
        {
          startsAt: "2026-08-10T19:00:00+08:00",
          endsAt: "2026-08-10T20:00:00+08:00",
        },
      ],
    });

    expect(slots).toEqual([
      {
        startsAt: "2026-08-10T12:00:00.000Z",
        endsAt: "2026-08-10T14:00:00.000Z",
        durationMinutes: 120,
      },
    ]);
  });

  it("can ignore all-day events when requested", () => {
    expect(
      findFreeTimeSlots({
        startsAt: "2026-08-10T00:00:00+08:00",
        endsAt: "2026-08-11T00:00:00+08:00",
        durationMinutes: 60,
        timezone: "Asia/Shanghai",
        workingHours: { startsAt: "09:00", endsAt: "10:00" },
        excludeAllDay: true,
        busy: [
          {
            startsAt: "2026-08-10T00:00:00+08:00",
            endsAt: "2026-08-11T00:00:00+08:00",
            isAllDay: true,
          },
        ],
      }),
    ).toHaveLength(1);
  });
});
