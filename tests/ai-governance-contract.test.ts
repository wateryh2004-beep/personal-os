import { describe, expect, it } from "vitest";
import { buildFallbackContextPlan } from "@/features/context/planner";
import { defaultAiGovernance, estimateAiCostUsd, summarizeContextSources } from "@/features/ai/governance";

describe("AI governance boundaries", () => {
  it("does not widen a general conversation to historical notes by default", () => {
    const plan = buildFallbackContextPlan({ message: "解释什么是机会成本", surface: "global" });
    expect(plan.recentNotes.enabled).toBe(false);
    expect(plan.useSemantic).toBe(false);
    // A lexical lookup, if the route asks for one, remains visible rather than
    // silently broadening to historical Notes.
    expect(plan.expansionReason).toContain("认知路由");
  });

  it("makes a deterministic retrospective expansion visible", () => {
    const plan = buildFallbackContextPlan({ message: "我最近反复在想什么？", surface: "global" });
    expect(plan.recentNotes.enabled).toBe(true);
    expect(plan.expansionReason).toContain("认知路由");
  });

  it("returns source metadata without copying source content", () => {
    const summary = summarizeContextSources({ version: "personal-context/v1", sources: [{ id: "S1", domain: "notes", title: "私密笔记", content: "绝不应出现在摘要中", timestamp: "2026-08-22T00:00:00.000Z", reasons: ["当前主题"], href: "/notes/a", entityType: "note", entityId: "a", origins: ["search"] }], generatedAt: "2026-08-22T00:00:00.000Z", timezone: "Asia/Shanghai", request: { surface: "notes", intent: "knowledge" }, plan: {} as never, diagnostics: {} as never });
    expect(summary).toMatchObject({ modules: ["notes"], entitiesByModule: { notes: 1 }, sourceCount: 1 });
    expect(JSON.stringify(summary)).not.toContain("绝不应出现在摘要中");
  });

  it("estimates usage from aggregate tokens without saving model input or output", () => {
    expect(estimateAiCostUsd(defaultAiGovernance, 1_000_000, 1_000_000)).toBe(2.5);
  });
});
