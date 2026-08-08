import { describe, expect, it } from "vitest";
import {
  estimateAssistantComplexity,
  selectAssistantModel,
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
});
