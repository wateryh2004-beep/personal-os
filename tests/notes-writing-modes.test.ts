import { describe, expect, it } from "vitest";
import { noteWritingModes, noteWritingModeLabels, writingProviderForMode, validOpenAiModelId } from "@/features/assistant/writing-modes";
describe("Notes writing models", () => {
  it("exposes three user modes", () => {
    expect(noteWritingModes).toEqual(["fast", "quality", "deep"]);
    expect(Object.values(noteWritingModeLabels)).toEqual(["快速处理", "高质量写作", "深度思考"]);
  });
  it("never silently routes OpenAI modes to another provider", () => {
    expect(writingProviderForMode("fast")).toBe("deepseek");
    expect(writingProviderForMode("quality")).toBe("openai");
    expect(writingProviderForMode("deep")).toBe("openai");
  });
  it("validates configured model IDs", () => {
    expect(validOpenAiModelId("gpt-5.1")).toBe(true);
    expect(validOpenAiModelId(undefined)).toBe(false);
    expect(validOpenAiModelId("https://example.com")).toBe(false);
    expect(validOpenAiModelId("a\nb")).toBe(false);
  });
});
