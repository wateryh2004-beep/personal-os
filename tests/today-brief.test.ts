import { describe, expect, it } from "vitest";
import { buildTodayBrief } from "@/features/today/brief";

describe("Today Brief", () => {
  it("uses deterministic records, preserves sources, and only opens the Agent for mutations", () => {
    const items = buildTodayBrief({
      now: new Date("2026-08-09T02:00:00Z"),
      timezone: "Asia/Shanghai",
      overdueTasks: [{ id: "task-1", title: "CFA", due_at: "2026-08-08T12:00:00Z", importance: "high", status: "notStarted" }],
      todayTasks: [],
      todayEvents: [{ id: "event-1", subject: "项目讨论", starts_at: "2026-08-09T06:00:00Z", ends_at: "2026-08-09T07:00:00Z", is_all_day: false, location_name: null }],
      milestones: [],
      inboxCount: 0,
    });

    expect(items[0].title).toBe("CFA");
    expect(items[0].sourceRefs[0]).toMatchObject({ domain: "tasks", id: "task-1" });
    expect(items[0].suggestedAction?.agentPrompt).toContain("先检查日历");
    expect(items.some((item) => item.title === "项目讨论")).toBe(true);
  });

  it("never promotes a historical unresolved milestone into today's brief", () => {
    const items = buildTodayBrief({
      now: new Date("2026-08-09T02:00:00Z"),
      timezone: "Asia/Shanghai",
      overdueTasks: [],
      todayTasks: [],
      todayEvents: [],
      milestones: [{ id: "past", track_id: "track", career_direction_id: null, title: "历史节点", starts_on: null, target_date: "2026-07-15", status: "planned", importance: "high" }],
      inboxCount: 0,
    });
    expect(items).toEqual([]);
  });

  it("uses planned language for today and ignores completed milestones", () => {
    const items = buildTodayBrief({
      now: new Date("2026-08-09T02:00:00Z"),
      timezone: "Asia/Shanghai",
      overdueTasks: [],
      todayTasks: [],
      todayEvents: [],
      milestones: [
        { id: "done", track_id: "track", career_direction_id: null, title: "已完成", starts_on: null, target_date: "2026-08-09", status: "completed", importance: "high" },
        { id: "today", track_id: "track", career_direction_id: null, title: "今日节点", starts_on: null, target_date: "2026-08-09", status: "planned", importance: "normal" },
      ],
      inboxCount: 0,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "今日节点", reason: "这个职业节点计划在今天。" });
  });

  it("only surfaces a high-importance 8-30 day milestone when no stronger brief item exists", () => {
    const base = {
      now: new Date("2026-08-09T02:00:00Z"),
      timezone: "Asia/Shanghai",
      overdueTasks: [],
      todayTasks: [],
      todayEvents: [],
      milestones: [{ id: "future", track_id: "track", career_direction_id: null, title: "远期重要节点", starts_on: null, target_date: "2026-08-20", status: "planned" as const, importance: "high" as const }],
    };
    expect(buildTodayBrief({ ...base, inboxCount: 0 })[0]).toMatchObject({ title: "远期重要节点", priority: 58 });
    expect(buildTodayBrief({ ...base, todayTasks: [{ id: "today-task", title: "今日任务", due_at: "2026-08-09T08:00:00Z", importance: "normal", status: "notStarted" }], inboxCount: 0 }).some((item) => item.title === "远期重要节点")).toBe(false);
  });
});
