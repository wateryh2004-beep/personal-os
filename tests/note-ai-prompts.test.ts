import { describe, expect, it } from "vitest";
import {
  isRewriteOperation,
  noteAiInstruction,
  noteAiOperations,
  noteAiPromptDefinitions,
  noteAiSystemPrompt,
  personalKnowledgeSystemPrompt,
} from "@/features/notes/ai-prompts";

describe("note AI prompt registry", () => {
  it("grounds summaries and actions in the submitted note", () => {
    expect(noteAiInstruction("summarizeNote")).toContain("仅依据当前笔记");
    expect(noteAiInstruction("extractActions")).toContain("不制造任务");
    expect(noteAiInstruction("deepThinkNote")).toContain("关键判断");
    expect(personalKnowledgeSystemPrompt).toContain("不得虚构");
    expect(personalKnowledgeSystemPrompt).toContain("Hang Yu");
    expect(personalKnowledgeSystemPrompt).toContain("AI 文案");
  });

  it("marks only transforms as rewrites", () => {
    expect(isRewriteOperation("polishNote")).toBe(true);
    expect(isRewriteOperation("summarizeNote")).toBe(false);
  });

  it("keeps a natural language question within the ask operation", () => {
    expect(noteAiInstruction("askNote", "这件事的风险是什么？")).toContain("这件事的风险是什么？");
    expect(noteAiInstruction("customSelection", "改成更有说服力的表述")).toContain("改成更有说服力的表述");
  });

  it("exposes every Notes prompt through one inspectable registry", () => {
    expect(noteAiPromptDefinitions).toHaveLength(noteAiOperations.length + 1);
    expect(new Set(noteAiPromptDefinitions.map((prompt) => prompt.key)).size).toBe(
      noteAiPromptDefinitions.length,
    );
  });

  it("applies owner overrides without changing versioned defaults", () => {
    const overrides = {
      "notes.system": "自定义系统边界",
      "notes.polishNote": "保留我的原话",
    } as const;
    expect(noteAiSystemPrompt(overrides)).toBe("自定义系统边界");
    expect(noteAiInstruction("polishNote", undefined, overrides)).toBe("保留我的原话");
    expect(personalKnowledgeSystemPrompt).not.toBe("自定义系统边界");
  });
});
