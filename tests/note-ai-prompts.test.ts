import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  generatedTitleQualityIssues,
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
    expect(noteAiInstruction("extractActions")).toContain("不得因为原文出现了问题");
    expect(noteAiInstruction("extractActions")).toContain("不得");
    expect(noteAiInstruction("deepThinkNote")).toContain("关键判断");
    expect(personalKnowledgeSystemPrompt).toContain("不得虚构");
    expect(personalKnowledgeSystemPrompt).toContain("Hang Yu");
    expect(personalKnowledgeSystemPrompt).toContain("AI 文案");
  });

  it("marks only direct replacements as rewrites", () => {
    expect(isRewriteOperation("polishNote")).toBe(true);
    expect(isRewriteOperation("translateNote")).toBe(true);
    expect(isRewriteOperation("summarizeNote")).toBe(false);
    // 大纲是衍生内容，只能插入/复制，不应直接覆盖整篇原文。
    expect(isRewriteOperation("outlineNote")).toBe(false);
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
    expect(noteAiInstruction("extractKeyInsights")).toContain("值得回看的判断");
    expect(noteAiInstruction("extractKeyInsights")).toContain("不把普通观点加工成口号");
    expect(noteAiInstruction("translateNote")).toContain("翻译成英文");
    expect(noteAiInstruction("outlineNote")).toContain("不替代原文");
    expect(isRewriteOperation("translateNote")).toBe(true);
    expect(isRewriteOperation("extractKeyInsights")).toBe(false);
  });

  it("anchors titles in note-specific content and rejects template-like comma titles", () => {
    const prompt = noteAiInstruction("generateTitle");
    expect(prompt).toContain("内容锚点");
    expect(prompt).toContain("单一语义单元");
    expect(prompt).toContain("禁止「A，B」式标题");
    expect(prompt).toContain("公众号标题");
    expect(prompt).toContain("只输出最终标题本身");
    // 不再把机械句式放进正向示例里给模型模仿。
    expect(prompt).not.toContain("选择，还是行动");
  });

  it("cleans title wrappers without silently repairing bad semantics", () => {
    expect(cleanTitle("「辞职去旅行」")).toBe("辞职去旅行");
    expect(cleanTitle("3、我的 AI 焦虑")).toBe("我的 AI 焦虑");
    expect(cleanTitle("## 标题：为什么我不想考公")).toBe("为什么我不想考公");
    expect(cleanTitle("  标题  ")).toBe("标题");
    // cleanTitle 不删除坏标点；质量层负责拒绝并触发重试。
    expect(cleanTitle("选择，还是行动")).toBe("选择，还是行动");
  });

  it("reports deterministic title quality failures", () => {
    expect(generatedTitleQualityIssues("选择，还是行动")).toContain(
      "不要使用逗号、顿号或分号拆成并列半句",
    );
    expect(generatedTitleQualityIssues("关于时间的思考")).toContain("标题过于通用");
    expect(generatedTitleQualityIssues("为什么我不想考公")).toEqual([]);
    expect(generatedTitleQualityIssues("华夏基金这段实习值不值得继续")).toEqual([]);
  });
});
