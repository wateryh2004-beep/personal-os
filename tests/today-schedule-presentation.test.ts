import { describe, expect, it, vi } from "vitest";
import { todayPresentation, todaySchedulePresentation } from "@/features/today/presentation";
import type { NowCalendarEvent, NowCommitment, NowWorkspace } from "@/features/today/types";

const event = (id: string, starts_at: string, ends_at: string, is_all_day = false): NowCalendarEvent => ({
  id, subject: id, starts_at, ends_at, is_all_day, location_name: null,
});
const past = event("past", "2026-10-01T01:00:00Z", "2026-10-01T02:00:00Z");
const ongoing = event("ongoing", "2026-10-01T03:00:00Z", "2026-10-01T05:00:00Z");
const next = event("next", "2026-10-01T06:00:00Z", "2026-10-01T07:00:00Z");
const tomorrow = event("tomorrow", "2026-10-02T01:00:00Z", "2026-10-02T02:00:00Z");
const allDay = event("all-day", "2026-09-30T16:00:00Z", "2026-10-01T16:00:00Z", true);

function workspace(today: NowCalendarEvent[], overrides: Partial<NowWorkspace> = {}): NowWorkspace {
  return {
    timezone: "Asia/Shanghai",
    calendar: { today, upcoming: [], connection: null },
    tasks: { overdue: [], today: [], upcoming: [] },
    career: { upcomingMilestones: [] },
    briefing: { entries: [], date: null },
    inboxCount: 0,
    commitments: [],
    nextAction: { kind: "none", reason: "" },
    todayBrief: [],
    attention: [],
    upcoming: [],
    availability: { calendar: "ready", tasks: "ready", career: "ready", inbox: "ready", briefing: "ready" },
    summary: { todayEventCount: today.length, todayTaskCount: 0, attentionCount: 0 },
    ...overrides,
  };
}

const eventAction = (item: NowCalendarEvent): NowWorkspace["nextAction"] => ({
  kind: "event", event: item, state: "upcoming", reason: "", href: `/calendar?event=${item.id}`,
});
const reminder = (item: NowCalendarEvent): NowCommitment => ({
  id: `reminder-${item.id}`, kind: "event", title: item.subject, whyNow: "日程提醒", constraint: "今天",
  href: `/calendar?event=${item.id}`, source: { domain: "calendar", entityId: item.id, label: "Calendar" },
});
const snapshot = "2026-10-01T04:00:00Z";

describe("Today schedule presentation", () => {
  it("retains legacy ordering, next-event cutoff and hidden counts without a timestamp", () => {
    const result = todaySchedulePresentation(workspace([next, past, allDay, ongoing], { nextAction: eventAction(ongoing) }));
    expect(result).toEqual({ allDay: [allDay], timed: [ongoing, next], past: [], nextEvent: ongoing, hiddenCount: 1 });
  });

  it("never lets tomorrow's next action remove today's events in a legacy workspace", () => {
    const result = todaySchedulePresentation(workspace([past, allDay], { nextAction: eventAction(tomorrow) }));
    expect(result).toEqual({ allDay: [allDay], timed: [past], past: [], nextEvent: null, hiddenCount: 0 });
  });

  it("preserves the legacy six-row cap when no next event is selected", () => {
    const events = Array.from({ length: 8 }, (_, index) => event(`event-${index}`, `2026-10-01T0${index}:00:00Z`, `2026-10-01T0${index + 1}:00:00Z`));
    expect(todaySchedulePresentation(workspace([...events].reverse()))).toEqual({
      allDay: [], timed: events.slice(0, 6), past: [], nextEvent: null, hiddenCount: 2,
    });
  });

  it("separates all-day, ongoing/upcoming and past rows using the workspace snapshot", () => {
    const input = workspace([next, past, allDay, ongoing], { generatedAt: snapshot });
    const result = todaySchedulePresentation(input);
    expect(result).toEqual({ allDay: [allDay], timed: [ongoing, next], past: [past], nextEvent: ongoing, hiddenCount: 0 });
    expect(input.calendar.today).toEqual([next, past, allDay, ongoing]);
  });

  it("keeps today's ended events available even when the next action is tomorrow", () => {
    expect(todaySchedulePresentation(workspace([past, allDay], { generatedAt: snapshot, nextAction: eventAction(tomorrow) }))).toEqual({
      allDay: [allDay], timed: [], past: [past], nextEvent: null, hiddenCount: 0,
    });
  });

  it("keeps overlapping ongoing events and treats an end exactly at the snapshot as past", () => {
    const overlapping = event("overlapping", "2026-10-01T02:30:00Z", "2026-10-01T04:30:00Z");
    const ended = event("ended", "2026-10-01T02:00:00Z", snapshot);
    const result = todaySchedulePresentation(workspace([ongoing, ended, overlapping], { generatedAt: snapshot, nextAction: eventAction(ongoing) }));
    expect(result.timed).toEqual([overlapping, ongoing]);
    expect(result.past).toEqual([ended]);
    expect(result.nextEvent).toEqual(overlapping);
  });

  it("uses the owner's local day, includes overnight events and excludes the previous midnight endpoint", () => {
    const overnight = event("overnight", "2026-09-30T15:00:00Z", "2026-09-30T17:00:00Z");
    const midnightEnd = event("previous-day", "2026-09-30T14:00:00Z", "2026-09-30T16:00:00Z");
    const localTomorrow = event("local-tomorrow", "2026-10-01T16:00:00Z", "2026-10-01T17:00:00Z");
    const result = todaySchedulePresentation(workspace([midnightEnd, overnight, allDay, localTomorrow], { generatedAt: snapshot }));
    expect(result).toEqual({ allDay: [allDay], timed: [], past: [overnight], nextEvent: null, hiddenCount: 0 });
  });

  it("counts only overflow rows as hidden when past events have their own list", () => {
    const future = Array.from({ length: 7 }, (_, index) => event(`future-${index}`, `2026-10-01T${String(index + 5).padStart(2, "0")}:00:00Z`, `2026-10-01T${String(index + 6).padStart(2, "0")}:00:00Z`));
    const secondAllDay = { ...allDay, id: "second-all-day", subject: "second-all-day" };
    const result = todaySchedulePresentation(workspace([past, ...future, secondAllDay, allDay], { generatedAt: snapshot }));
    expect(result.allDay).toEqual([allDay, secondAllDay]);
    expect(result.timed).toEqual(future.slice(0, 4));
    expect(result.past).toEqual([past]);
    expect(result.hiddenCount).toBe(3);
    expect(result.allDay.length + result.timed.length + result.past.length + result.hiddenCount).toBe(10);
  });

  it("orders real instants consistently even if ISO timestamps use different offsets", () => {
    const first = event("first", "2026-10-01T12:30:00+08:00", "2026-10-01T13:00:00+08:00");
    const later = event("later", "2026-10-01T05:30:00Z", "2026-10-01T06:00:00Z");
    const result = todaySchedulePresentation(workspace([later, first], { generatedAt: snapshot }));
    expect(result.timed).toEqual([first, later]);
    expect(result.nextEvent).toEqual(first);
  });

  it("does not depend on the rendering clock", () => {
    const input = workspace([past, ongoing, next], { generatedAt: snapshot });
    const expected = todaySchedulePresentation(input);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
      expect(todaySchedulePresentation(input)).toEqual(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back safely for invalid snapshots and supports an empty day", () => {
    expect(todaySchedulePresentation(workspace([past], { generatedAt: "invalid", nextAction: eventAction(tomorrow) })).timed).toEqual([past]);
    expect(todaySchedulePresentation(workspace([], { generatedAt: snapshot }))).toEqual({ allDay: [], timed: [], past: [], nextEvent: null, hiddenCount: 0 });
  });

  it("deduplicates reminders against visible past rows and preserves overflow reminders", () => {
    const future = Array.from({ length: 7 }, (_, index) => event(`future-${index}`, `2026-10-01T${String(index + 5).padStart(2, "0")}:00:00Z`, `2026-10-01T${String(index + 6).padStart(2, "0")}:00:00Z`));
    const result = todayPresentation(workspace([past, ...future], {
      generatedAt: snapshot, commitments: [reminder(past), reminder(future[0]), reminder(future[6])],
    }));
    expect(result.scheduleReminderCount).toBe(2);
    expect(result.commitments).toEqual([reminder(future[6])]);
  });
});
