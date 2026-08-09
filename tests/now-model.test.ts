import { describe, expect, it } from "vitest";
import {
  buildTodayFocusStack,
  buildTodaySchedule,
  eventIsToday,
  getDateKeyInTimeZone,
  groupNowTasks,
  runTodaySideEffectSafely,
  selectNextAction,
  todayAvailabilityForError,
} from "@/features/today/utils";
import { buildProactiveInsights } from "@/features/proactive/engine";

const now = new Date("2026-08-08T02:00:00.000Z");
const timeZone = "Asia/Shanghai";
const task = (id: string, due_at: string | null, importance: string | null = "normal", status = "notStarted") => ({ id, title: id, due_at, importance, status });

describe("Now model", () => {
  it("groups time-sensitive tasks by the user's local day and excludes completed/undated work", () => {
    const groups = groupNowTasks([task("overdue", "2026-08-06T10:00:00Z"), task("today", "2026-08-08T10:00:00Z"), task("upcoming", "2026-08-09T10:00:00Z"), task("done", "2026-08-07T10:00:00Z", "high", "completed"), task("undated", null)], now, timeZone);
    expect(groups.overdue.map((item) => item.id)).toEqual(["overdue"]);
    expect(groups.today.map((item) => item.id)).toEqual(["today"]);
    expect(groups.upcoming.map((item) => item.id)).toEqual(["upcoming"]);
    expect(getDateKeyInTimeZone("2026-08-08T15:30:00Z", "Asia/Tokyo")).toBe("2026-08-09");
  });
  it("returns stable empty groups and keeps all-day schedule rows before timed rows", () => {
    expect(groupNowTasks([], now, timeZone)).toEqual({
      overdue: [],
      today: [],
      upcoming: [],
    });
    expect(buildTodaySchedule([])).toEqual({
      allDay: [],
      timed: [],
      hiddenCount: 0,
    });
    const schedule = buildTodaySchedule(
      [
        { id: "timed", subject: "会议", starts_at: "2026-08-08T04:00:00Z", ends_at: "2026-08-08T05:00:00Z", is_all_day: false, location_name: null },
        { id: "all-day", subject: "休假", starts_at: "2026-08-07T16:00:00Z", ends_at: "2026-08-08T16:00:00Z", is_all_day: true, location_name: null },
      ],
      1,
    );
    expect(schedule.allDay.map((event) => event.id)).toEqual(["all-day"]);
    expect(schedule.timed).toEqual([]);
    expect(schedule.hiddenCount).toBe(1);
  });
  it("keeps a cross-midnight event in today's schedule and does not let all-day events block Next", () => {
    const cross = { id: "cross", subject: "跨日", starts_at: "2026-08-07T15:00:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null };
    expect(eventIsToday(cross, now, timeZone)).toBe(true);
    const next = selectNextAction({ now, timeZone, events: [{ ...cross, id: "all-day", is_all_day: true }, { id: "soon", subject: "会议", starts_at: "2026-08-08T02:20:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null }], tasks: groupNowTasks([task("today", "2026-08-08T10:00:00Z")], now, timeZone), milestones: [], inboxCount: 0 });
    expect(next).toMatchObject({ kind: "event", state: "starting_soon" });
  });
  it("uses deterministic event, task, career, inbox, then none fallbacks", () => {
    const groups = groupNowTasks([task("overdue-high", "2026-08-06T10:00:00Z", "high")], now, timeZone);
    expect(selectNextAction({ now, timeZone, events: [], tasks: groups, milestones: [], inboxCount: 0 })).toMatchObject({ kind: "task", reason: "已逾期" });
    expect(selectNextAction({ now, timeZone, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [{ id: "m", track_id: "t", career_direction_id: null, title: "节点", starts_on: null, target_date: "2026-08-10", status: "planned", importance: "normal" }], inboxCount: 2 })).toMatchObject({ kind: "career_milestone", reason: "距离职业节点还有 2 天" });
    expect(selectNextAction({ now, timeZone, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [{ id: "past", track_id: "t", career_direction_id: null, title: "历史", starts_on: null, target_date: "2026-07-15", status: "planned", importance: "high" }], inboxCount: 2 })).toMatchObject({ kind: "inbox" });
    expect(selectNextAction({ now, timeZone, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [], inboxCount: 2 })).toMatchObject({ kind: "inbox" });
    expect(selectNextAction({ now, timeZone, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [], inboxCount: 0 })).toMatchObject({ kind: "none" });
  });
  it("builds a bounded, priority-ordered proactive attention budget", () => {
    const attention = buildProactiveInsights({ now, timeZone, tasks: [task("overdue", "2026-08-06T10:00:00Z", "high")], events: [{ id: "event", subject: "面试", starts_at: "2026-08-08T02:20:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null }], milestones: [{ id: "m", track_id: "t", career_direction_id: null, title: "节点", starts_on: null, target_date: "2026-08-10", status: "planned", importance: "normal" }] });
    expect(attention.map((item) => item.kind)).toEqual(["task_overdue", "calendar_upcoming", "career_milestone_approaching"]);
  });

  it("builds one bounded focus stack without duplicating overdue or Next reminders", () => {
    const groups = groupNowTasks(
      [
        task("overdue", "2026-08-06T10:00:00Z", "high"),
        task("today", "2026-08-08T10:00:00Z"),
      ],
      now,
      timeZone,
    );
    const next = selectNextAction({
      now,
      timeZone,
      events: [],
      tasks: groups,
      milestones: [],
      inboxCount: 0,
    });
    const stack = buildTodayFocusStack(
      groups,
      [
        { id: "overdue", kind: "task_overdue", priority: "high", title: "1 项任务已经逾期", href: "/tasks" },
        { id: "weekly-review", kind: "weekly_review_due", priority: "low", title: "本周复盘", href: "/reviews" },
      ],
      next,
      8,
    );
    expect(stack.tasks.map(({ task: item }) => item.id)).toEqual(["overdue", "today"]);
    expect(stack.attention.map((item) => item.id)).toEqual(["weekly-review"]);
  });

  it("maps missing optional tables to ready, real query failures to unavailable", () => {
    expect(todayAvailabilityForError(null)).toBe("ready");
    expect(todayAvailabilityForError({ code: "42P01" })).toBe("ready");
    expect(todayAvailabilityForError({ code: "PGRST205" })).toBe("ready");
    expect(todayAvailabilityForError({ code: "42501" })).toBe("unavailable");
  });

  it("does not surface a background reconciliation failure", async () => {
    await expect(
      runTodaySideEffectSafely(async () => {
        throw new Error("write failed");
      }),
    ).resolves.toBeUndefined();
  });

  it("does not create proactive attention for historical milestones", () => {
    const attention = buildProactiveInsights({ now, timeZone, tasks: [], events: [], milestones: [{ id: "past", track_id: "t", career_direction_id: null, title: "历史", starts_on: null, target_date: "2026-07-15", status: "planned", importance: "high" }], weeklyReviewCompleted: true });
    expect(attention).toEqual([]);
  });
});
