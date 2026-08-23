import { describe, expect, it } from "vitest";
import {
  estimateAssistantComplexity,
  selectAssistantModel,
  selectReasoningProviderOptionsForRequest,
} from "@/features/assistant/model-router";

describe("Assistant model routing", () => {
  it("uses Flash for a simple lookup and Pro for cross-domain reasoning", () => {
    expect(selectAssistantModel({ surface: "global", message: "查一下明天日程" })).toBe(
      "deepseek-v4-flash",
    );
    expect(
      selectAssistantModel({
        surface: "global",
        message: "结合职业规划、最近复盘和笔记分析我的长期取舍",
      }),
    ).toBe("deepseek-v4-pro");
  });

  it("honors an explicit model request", () => {
    expect(
      selectAssistantModel({
        surface: "global",
        message: "简单问题",
        requestedModel: "deepseek-v4-pro",
      }),
    ).toBe("deepseek-v4-pro");
    expect(estimateAssistantComplexity({ surface: "career", message: "一句话" })).toBe(
      "complex",
    );
  });

  it("disables reasoning for direct note rewrites so the visible result is not starved", () => {
    const route = {
      recipe: "current_document" as const,
      complexity: "moderate" as const,
      requiresReasoning: false,
      preferredDomains: ["notes"],
      capabilities: ["current_document" as const],
      queryConcepts: [],
      timeWindow: { days: 0, expandedDays: 0, minimumRecentNotes: 0 },
      confidence: 1,
      signals: [],
    };

    expect(
      selectReasoningProviderOptionsForRequest({
        surface: "notes",
        mode: "transform",
        operation: "polishSelection",
        route,
      }),
    ).toEqual({ deepseek: { thinking: { type: "disabled" } } });
    expect(
      selectReasoningProviderOptionsForRequest({
        surface: "notes",
        mode: "transform",
        operation: "deepThinkNote",
        route,
      }),
    ).toMatchObject({ deepseek: { thinking: { type: "enabled" } } });
  });

  it("keeps title generation non-thinking after production audits showed reasoning dominated latency", () => {
    expect(
      selectReasoningProviderOptionsForRequest({
        surface: "notes",
        mode: "transform",
        operation: "generateTitle",
      }),
    ).toEqual({ deepseek: { thinking: { type: "disabled" } } });
  });
});
