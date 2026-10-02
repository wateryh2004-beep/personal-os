import { describe, expect, it } from "vitest";
import { getCareerNextActions } from "@/features/career/next-actions";
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
  });
  it("ignores paused targets and practice while preserving the original submitted values of human labels", () => {
    expect(getCareerNextActions([{ ...target, status: "paused" }], [{ context_id: "target", status: "draft", next_practice_at: null }], [], now)).toEqual([]);
    expect(getCareerNextActions([target], [{ context_id: "target", status: "paused", next_practice_at: null }], [], now)).toEqual([]);
    expect(careerOptions(["responsibility", "document_verified"])).toEqual([{ value: "responsibility", label: "职责" }, { value: "document_verified", label: "材料验证" }]);
  });
});
