import { describe, expect, it } from "vitest";
import { isRewriteOperation, noteAiInstruction, personalKnowledgeSystemPrompt } from "@/features/notes/ai-prompts";

describe("note AI prompt registry", () => {
  it("grounds summaries and actions in the submitted note", () => {
    expect(noteAiInstruction("summarizeNote")).toContain("仅依据当前笔记");
    expect(noteAiInstruction("extractActions")).toContain("不制造任务");
    expect(noteAiInstruction("deepThinkNote")).toContain("关键判断");
    expect(personalKnowledgeSystemPrompt).toContain("不得虚构");
  });

  it("marks only transforms as rewrites", () => {
    expect(isRewriteOperation("polishNote")).toBe(true);
    expect(isRewriteOperation("summarizeNote")).toBe(false);
  });

  it("keeps a natural language question within the ask operation", () => {
    expect(noteAiInstruction("askNote", "这件事的风险是什么？")).toContain("这件事的风险是什么？");
    expect(noteAiInstruction("customSelection", "改成更有说服力的表述")).toContain("改成更有说服力的表述");
  });
});
