import { describe, expect, it } from "vitest";
import { calendarNearSyncWindow, calendarSyncWindow } from "@/features/calendar/sync-policy";

const DAY = 86_400_000;
const now = Date.parse("2026-08-15T04:00:00.000Z");

describe("calendar history window", () => {
  it("covers two years of past events so Outlook history is mirrored", () => {
    const window = calendarSyncWindow(now);
    expect(Date.parse(window.start)).toBe(now - 730 * DAY);
    expect(Date.parse(window.end)).toBe(now + 180 * DAY);
  });
});

it("keeps high-frequency delta work inside the near-term working window", () => {
  const window = calendarNearSyncWindow(now);
  expect(Date.parse(window.start)).toBe(now - 14 * DAY);
  expect(Date.parse(window.end)).toBe(now + 60 * DAY);
});
