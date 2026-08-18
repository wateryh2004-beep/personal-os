import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  isRewriteOperation,
  noteAiCitationOperations,
  noteAiCitationRule,
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

  it("carries the output contract into the global system prompt", () => {
    expect(personalKnowledgeSystemPrompt).toContain("输出契约");
    expect(personalKnowledgeSystemPrompt).toContain("不要用 Markdown 代码围栏");
  });

  it("defines a citation rule scoped to understanding operations", () => {
    expect(noteAiCitationRule).toContain("原文没有说明");
    expect(noteAiCitationOperations).toEqual(["askNote", "deepThinkNote", "explainSelection"]);
  });

  it("registers the extra presets as real operations", () => {
    expect(noteAiOperations).toContain("extractKeyInsights");
    expect(noteAiOperations).toContain("translateNote");
    expect(noteAiOperations).toContain("outlineNote");
    expect(noteAiInstruction("extractKeyInsights")).toContain("提炼");
    expect(noteAiInstruction("translateNote")).toContain("翻译成英文");
    expect(noteAiInstruction("outlineNote")).toContain("大纲");
    expect(isRewriteOperation("translateNote")).toBe(true);
    expect(isRewriteOperation("outlineNote")).toBe(true);
    expect(isRewriteOperation("extractKeyInsights")).toBe(false);
  });

  it("pushes for diverse title shapes and quality instead of banning punctuation", () => {
    const prompt = noteAiInstruction("generateTitle");
    // 单步生成：模型在心中列多角度候选、自选最优，不再走独立评审。
    // 追求的是句式多样与质量，而不是一刀切禁逗号。
    expect(prompt).toContain("5 个角度各异的候选");
    expect(prompt).toContain("句式多样性");
    expect(prompt).toContain("对仗式");
    expect(prompt).toContain("记忆点");
    expect(prompt).toContain("个人气味");
    expect(prompt).toContain("只输出最终选中的标题本身");
    expect(prompt).not.toContain("绝对禁止出现任何逗号");
    expect(prompt).not.toContain("JSON 字符串数组");
  });

  it("cleans the final title before it lands in the title field", () => {
    expect(cleanTitle("「辞职去旅行」")).toBe("辞职去旅行");
    expect(cleanTitle("3、我的 AI 焦虑")).toBe("我的 AI 焦虑");
    expect(cleanTitle("  标题  ")).toBe("标题");
  });
});
