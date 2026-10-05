import { describe, expect, it } from "vitest";
import { getCareerNextActions, getCareerPreparationCounts } from "@/features/career/next-actions";
import { careerOptions } from "@/features/career/labels";

const now = Date.parse("2026-10-03T08:00:00Z");
const target = { id: "target", title: "Target", organization_snapshot: "Example", role_title_snapshot: "Analyst", next_interview_at: null, status: "active" };

describe("career next actions", () => {
  it("has a real empty state when targets exist but nothing needs practice", () => {
    expect(getCareerNextActions([target], [{ context_id: "target", status: "ready", next_practice_at: "2026-10-09T08:00:00Z" }], [], now)).toEqual([]);
  });
  it("retains upcoming interview dates and orders actual dated work before undated practice", () => {
    const result = getCareerNextActions([{ ...target, next_interview_at: "2026-10-04T09:00:00Z" }, { ...target, id: "undated" }], [{ context_id: "undated", status: "draft", next_practice_at: null }], [{ id: "due", title: "Submit", target_date: "2026-10-03", status: "planned" }, { id: "done", title: "Done", target_date: "2026-10-02", status: "completed" }], now);
    expect(result.map((item) => item.key)).toEqual(["milestone-due", "target-target", "target-undated"]);
    expect(result[1].dueAt).toBe("2026-10-04T09:00:00Z");
    expect(result[2]).toMatchObject({ meta: "1 道题待安排练习", dueAt: null });
  });
  it("separates scheduled due practice from undated preparation without flagging ready or paused work", () => {
    const preparations = [
      { context_id: "target", status: "practicing", next_practice_at: "2026-10-03T08:00:00Z" },
      { context_id: "target", status: "ready", next_practice_at: "2026-10-02T08:00:00Z" },
      { context_id: "target", status: "developing", next_practice_at: null },
      { context_id: "target", status: "ready", next_practice_at: null },
      { context_id: "target", status: "paused", next_practice_at: null },
      { context_id: "target", status: "paused", next_practice_at: "2026-10-02T08:00:00Z" },
      { context_id: "target", status: "developing", next_practice_at: "2026-10-04T08:00:00Z" },
    ];
    expect(getCareerPreparationCounts(preparations, now)).toEqual({ ready: 2, due: 2, unscheduled: 1 });
    expect(getCareerNextActions([target], preparations, [], now)[0].meta).toBe("2 道题到期练习");
    expect(getCareerNextActions([target], [{ context_id: "target", status: "ready", next_practice_at: null }], [], now)).toEqual([]);
  });
  it("does not let historical unresolved or resolved milestones displace upcoming actions", () => {
    const old = Array.from({ length: 6 }, (_, index) => ({ id: `old-${index}`, title: "Historical plan", target_date: "2026-09-01", status: "planned" }));
    const resolved = ["completed", "skipped", "cancelled", "archived"].map((status) => ({ id: status, title: status, target_date: "2026-10-03", status }));
    const result = getCareerNextActions([{ ...target, next_interview_at: "2026-10-04T09:00:00Z" }], [], [...old, ...resolved, { id: "upcoming", title: "Next plan", target_date: "2026-10-05", status: "in_progress" }], now);
    expect(result.map((item) => item.key)).toEqual(["target-target", "milestone-upcoming"]);
  });
  it("keeps local today eligible across the UTC boundary and sorts dates beside interviews in that timezone", () => {
    const boundaryNow = Date.parse("2026-10-04T00:30:00Z");
    const milestones = [
      { id: "yesterday", title: "Past", target_date: "2026-10-02", status: "planned" },
      { id: "today", title: "Today", target_date: "2026-10-03", status: "planned" },
      { id: "tomorrow", title: "Tomorrow", target_date: "2026-10-04", status: "planned" },
    ];
    const result = getCareerNextActions([{ ...target, next_interview_at: "2026-10-04T01:00:00Z" }], [], milestones, boundaryNow, "America/Los_Angeles");
    expect(result.map((item) => item.key)).toEqual(["milestone-today", "target-target", "milestone-tomorrow"]);
    const shanghaiResult = getCareerNextActions([], [], milestones, Date.parse("2026-10-03T16:30:00Z"), "Asia/Shanghai");
    expect(shanghaiResult.map((item) => item.key)).toEqual(["milestone-tomorrow"]);
  });
  it("caps the actual action list at four while preserving chronological ordering", () => {
    const milestones = Array.from({ length: 6 }, (_, index) => ({ id: String(index), title: "Upcoming", target_date: `2026-10-${String(9 - index).padStart(2, "0")}`, status: "planned" }));
    expect(getCareerNextActions([], [], milestones, now).map((item) => item.key)).toEqual(["milestone-5", "milestone-4", "milestone-3", "milestone-2"]);
  });
  it("ignores paused targets and practice while preserving the original submitted values of human labels", () => {
    expect(getCareerNextActions([{ ...target, status: "paused" }], [{ context_id: "target", status: "draft", next_practice_at: null }], [], now)).toEqual([]);
    expect(getCareerNextActions([target], [{ context_id: "target", status: "paused", next_practice_at: null }], [], now)).toEqual([]);
    expect(careerOptions(["responsibility", "document_verified"])).toEqual([{ value: "responsibility", label: "职责" }, { value: "document_verified", label: "材料验证" }]);
  });
});
