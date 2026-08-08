import { describe, expect, it } from "vitest";
import { noteRevisionMatches } from "@/features/assistant/action-guards";
import {
  noteCreateProposalSchema,
  noteUpdateProposalSchema,
  careerFactProposalSchema,
  memoryCreateProposalSchema,
  projectCreateProposalSchema,
  parseAgentActionPayload,
} from "@/features/assistant/tools/schemas";
import {
  hasDeterministicExecutor,
} from "@/features/assistant/executor";
import { contentHash } from "@/features/notes/utils";

const id = "00000000-0000-4000-8000-000000000001";

describe("Agent proposal and deterministic execution boundary", () => {
  it("validates frozen note payloads again before execution", () => {
    expect(
      noteCreateProposalSchema.safeParse({
        title: "新笔记",
        bodyMarkdown: "正文",
        folderId: null,
        summaryOfChanges: "保存想法",
      }).success,
    ).toBe(true);
    expect(
      noteUpdateProposalSchema.safeParse({
        noteId: id,
        expectedRevision: -1,
        currentTitle: "标题",
        currentBodyHash: "hash",
        suggestedBody: "正文",
        summaryOfChanges: "修改",
      }).success,
    ).toBe(false);
    expect(parseAgentActionPayload("notes.delete", {}).success).toBe(false);
  });

  it("keeps Career facts unverified and requires bounded Working Memory", () => {
    expect(
      careerFactProposalSchema.safeParse({
        experienceId: id,
        factType: "result",
        content: "完成分析",
        reason: "用户明确记录了这项结果",
      }).success,
    ).toBe(true);
    expect(
      memoryCreateProposalSchema.safeParse({
        type: "working",
        title: "当前重点",
        content: "准备 CFA",
        reason: "近期多条记录支持",
        validUntil: null,
        reviewAt: null,
      }).success,
    ).toBe(false);
  });

  it("allows only explicitly implemented deterministic action types", () => {
    expect(hasDeterministicExecutor("calendar.create")).toBe(true);
    expect(hasDeterministicExecutor("notes.update")).toBe(true);
    expect(hasDeterministicExecutor("notes.delete")).toBe(false);
    expect(hasDeterministicExecutor("projects.create")).toBe(true);
    expect(hasDeterministicExecutor("sql.execute")).toBe(false);
  });

  it("validates project proposal dates before freezing", () => {
    expect(projectCreateProposalSchema.safeParse({
      name: "Personal OS 3.0",
      description: "长期项目",
      startDate: "2026-08-09",
      dueDate: "2026-09-01",
      reason: "用户明确要求创建",
    }).success).toBe(true);
    expect(projectCreateProposalSchema.safeParse({
      name: "错误项目",
      startDate: "2026-09-01",
      dueDate: "2026-08-09",
      reason: "测试",
    }).success).toBe(false);
  });

  it("detects a revision or content conflict instead of overwriting", () => {
    const body = "用户的新正文";
    expect(
      noteRevisionMatches(
        { revision: 6, bodyMarkdown: body, contentHash: contentHash(body) },
        { revision: 5, contentHash: contentHash("旧正文") },
      ),
    ).toBe(false);
    expect(
      noteRevisionMatches(
        { revision: 5, bodyMarkdown: body, contentHash: null },
        { revision: 5, contentHash: contentHash(body) },
      ),
    ).toBe(true);
  });
});
