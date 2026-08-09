import { describe, expect, it } from "vitest";
import { getCognitiveRecipe } from "@/features/assistant/recipes/registry";
import { selectReasoningProviderOptions } from "@/features/assistant/model-router";
import { routeCognitiveTask } from "@/features/assistant/cognitive-router";
import { rankContextCandidates } from "@/features/context/ranking";
import type { ContextCandidate } from "@/features/context/types";

describe("Cognitive recipes and epistemic discipline", () => {
  it("requires independent sources for retrospective themes", () => {
    const recipe = getCognitiveRecipe("retrospective_thinking");
    expect(recipe.minimumRecentNotes).toBe(5);
    expect(recipe.synthesisRules.join(" ")).toContain("至少两个独立记录");
    expect(recipe.uncertaintyRules.join(" ")).toContain("弱信号");
  });

  it("enables strong reasoning only for analytical recipes", () => {
    const factual = routeCognitiveTask({ message: "查一下理发记录", surface: "global" });
    const belief = routeCognitiveTask({ message: "我最近是不是改变了对量化的看法？", surface: "global" });
    expect(selectReasoningProviderOptions(factual).deepseek.thinking.type).toBe("disabled");
    expect(selectReasoningProviderOptions(belief).deepseek.thinking.type).toBe("enabled");
    expect(selectReasoningProviderOptions(belief).deepseek.reasoningEffort).toBe("max");
  });

  it("keeps a current decision above a conflicting historical note", () => {
    const base: ContextCandidate = {
      key: "note:a", entityType: "note", entityId: "a", domain: "notes", title: "历史方向",
      content: "当时想做 A", origins: ["recent_notes"], reasons: [], score: 140, priority: 0,
      timestamp: "2026-08-01T00:00:00Z",
    };
    const ranked = rankContextCandidates([
      base,
      { ...base, key: "decision:b", entityType: "decision", entityId: "b", domain: "memory", title: "Decision · 选择 B", content: "当前选择 B", origins: ["memory"], score: 140 },
    ], new Date("2026-08-09T00:00:00Z"), "belief_change");
    expect(ranked[0].entityType).toBe("decision");
    expect(ranked.map((item) => item.content)).toEqual(expect.arrayContaining(["当时想做 A", "当前选择 B"]));
  });
});
