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
});
