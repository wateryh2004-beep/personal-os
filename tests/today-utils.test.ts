import { describe, expect, it } from "vitest";
import { formatTodayDate, isDueToday, splitTodayTasks } from "@/features/today/utils";

describe("Today utilities", () => {
  const now = new Date("2026-08-07T02:00:00.000Z");

  it("uses the configured timezone to identify today", () => {
    expect(isDueToday("2026-08-07T15:00:00.000Z", now, "Asia/Shanghai")).toBe(true);
    expect(isDueToday("2026-08-08T16:00:00.000Z", now, "Asia/Shanghai")).toBe(false);
  });

  it("keeps due-today tasks ahead of upcoming work", () => {
    const tasks = splitTodayTasks([
      { id: "later", title: "Later", due_at: "2026-08-09T03:00:00.000Z", importance: null, status: "notStarted" },
      { id: "today", title: "Today", due_at: "2026-08-07T12:00:00.000Z", importance: "high", status: "notStarted" },
      { id: "done", title: "Done", due_at: "2026-08-07T12:00:00.000Z", importance: null, status: "completed" },
    ], now, "Asia/Shanghai");
    expect(tasks.today.map((task) => task.id)).toEqual(["today"]);
    expect(tasks.upcoming.map((task) => task.id)).toEqual(["later"]);
  });

  it("renders a compact Chinese date", () => {
    expect(formatTodayDate(now, "Asia/Shanghai")).toContain("8月7日");
  });
});
