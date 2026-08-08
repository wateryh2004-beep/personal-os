import { describe, expect, it } from "vitest";
import { eventIsToday, getDateKeyInTimeZone, groupNowTasks, selectNextAction } from "@/features/today/utils";
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
  it("keeps a cross-midnight event in today's schedule and does not let all-day events block Next", () => {
    const cross = { id: "cross", subject: "跨日", starts_at: "2026-08-07T15:00:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null };
    expect(eventIsToday(cross, now, timeZone)).toBe(true);
    const next = selectNextAction({ now, events: [{ ...cross, id: "all-day", is_all_day: true }, { id: "soon", subject: "会议", starts_at: "2026-08-08T02:20:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null }], tasks: groupNowTasks([task("today", "2026-08-08T10:00:00Z")], now, timeZone), milestones: [], inboxCount: 0 });
    expect(next).toMatchObject({ kind: "event", state: "starting_soon" });
  });
  it("uses deterministic event, task, career, inbox, then none fallbacks", () => {
    const groups = groupNowTasks([task("overdue-high", "2026-08-06T10:00:00Z", "high")], now, timeZone);
    expect(selectNextAction({ now, events: [], tasks: groups, milestones: [], inboxCount: 0 })).toMatchObject({ kind: "task", reason: "已逾期" });
    expect(selectNextAction({ now, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [{ id: "m", track_id: "t", career_direction_id: null, title: "节点", starts_on: null, target_date: "2026-08-10", status: "planned", importance: "normal" }], inboxCount: 2 })).toMatchObject({ kind: "career_milestone" });
    expect(selectNextAction({ now, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [], inboxCount: 2 })).toMatchObject({ kind: "inbox" });
    expect(selectNextAction({ now, events: [], tasks: groupNowTasks([], now, timeZone), milestones: [], inboxCount: 0 })).toMatchObject({ kind: "none" });
  });
  it("builds a bounded, priority-ordered proactive attention budget", () => {
    const attention = buildProactiveInsights({ now, timeZone, tasks: [task("overdue", "2026-08-06T10:00:00Z", "high")], events: [{ id: "event", subject: "面试", starts_at: "2026-08-08T02:20:00Z", ends_at: "2026-08-08T03:00:00Z", is_all_day: false, location_name: null }], milestones: [{ id: "m", track_id: "t", career_direction_id: null, title: "节点", starts_on: null, target_date: "2026-08-10", status: "planned", importance: "normal" }] });
    expect(attention.map((item) => item.kind)).toEqual(["task_overdue", "calendar_upcoming", "career_milestone_approaching"]);
  });
});
