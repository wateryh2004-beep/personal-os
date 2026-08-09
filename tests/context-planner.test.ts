import { describe, expect, it } from "vitest";
import { buildFallbackContextPlan } from "@/features/context/planner";

describe("Personal Context planner", () => {
  it("loads confirmed personal context for identity questions", () => {
    const plan = buildFallbackContextPlan({
      message: "你知道我是谁吗？",
      surface: "global",
    });

    expect(plan.intent).toBe("personal_analysis");
    expect(plan.includeWorkingMemory).toBe(true);
    expect(plan.expandGraph).toBe(true);
  });
});
