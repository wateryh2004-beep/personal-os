import { describe, expect, it } from "vitest";
import { focusSaveError, selectFocusCandidates, todayFocusSchema } from "@/features/today/focus";
import { eventRecordHref, milestoneRecordHref, taskRecordHref } from "@/features/today/record-links";
import { buildNowCommitments, groupNowTasks } from "@/features/today/utils";

const ids = [1,2,3,4].map((n) => `c0000000-0000-4000-8000-00000000000${n}`);
const task = (id: string, title: string, due_at: string | null = null, status = "notStarted") => ({ id, title, due_at, status, importance: "normal" });
describe("explicit Today priorities", () => {
  it("accepts an empty reset or 1–3 IDs, rejects duplicates, invalid dates and extra priorities", () => {
    const input = { date: "2026-10-01", taskIds: ids.slice(0,3), previousIds: [] };
    expect(todayFocusSchema.safeParse(input).success).toBe(true);
    expect(todayFocusSchema.safeParse({ ...input, taskIds: [] }).success).toBe(true);
    expect(todayFocusSchema.safeParse({ ...input, taskIds: ids }).success).toBe(false);
    expect(todayFocusSchema.safeParse({ ...input, taskIds: [ids[0],ids[0]] }).success).toBe(false);
    expect(todayFocusSchema.safeParse({ ...input, date: "2026-02-30" }).success).toBe(false);
  });
  it("includes undated work without converting it into a due reminder", () => {
    const undated = task(ids[0], "Prepare interview");
    const candidates = [undated, task(ids[1], "Archived selection", null, "completed"), task(ids[2], "Another")];
    expect(selectFocusCandidates(candidates, "INTERVIEW", [])).toEqual([undated]);
    expect(selectFocusCandidates(candidates, "", [ids[0]])).toEqual([candidates[2]]);
    const now = new Date("2026-10-01T08:00:00Z");
    expect(buildNowCommitments({ now, timeZone: "Asia/Shanghai", tasks: groupNowTasks([undated],now,"Asia/Shanghai"), events: [], milestones: [], inboxCount: 0 })).toEqual([]);
  });
  it("reports stale devices and changed days without claiming the save worked", () => {
    expect(focusSaveError("focus_conflict")).toContain("其他窗口");
    expect(focusSaveError("focus_date_changed")).toContain("日期已变化");
    expect(focusSaveError("network")).toContain("未能确认");
  });
  it("links directly to bounded source records with encoded identifiers", () => {
    expect(taskRecordHref("a&b")).toBe("/tasks?task=a%26b");
    expect(eventRecordHref(ids[0])).toBe(`/calendar?event=${ids[0]}`);
    expect(milestoneRecordHref(ids[0])).toBe(`/career/roadmap?milestone=${ids[0]}`);
  });
});
