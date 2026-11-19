import { describe, expect, it } from "vitest";
import { noteAiApplyBlocker, type AiApplicationInput, type AiApplyCurrent } from "@/features/notes/editor/ai-apply-safety";

const draft: AiApplicationInput = {
  expectedRevision: 7, expectedTitle: "原始标题", expectedBody: "原始正文",
  operation: "polishNote", scope: "note", mode: "replace", runId: "test",
};
const clean: AiApplyCurrent = {
  currentRevision: 7, knownRemoteRevision: 7,
  currentTitle: "原始标题", currentBody: "原始正文",
  isDirty: false, isSaving: false, saveState: "已保存",
};
describe("AI note apply preflight", () => {
  it("allows only exactly matching, persisted source", () => {
    expect(noteAiApplyBlocker({ ...draft, ...clean })).toBeNull();
  });
  it("rejects changes made during generation", () => {
    expect(noteAiApplyBlocker({ ...draft, ...clean, currentBody: "原始正文 + 新增内容" })).toContain("变化");
    expect(noteAiApplyBlocker({ ...draft, ...clean, currentTitle: "新标题" })).toContain("变化");
    expect(noteAiApplyBlocker({ ...draft, ...clean, isDirty: true })).toContain("未保存");
  });
  it("rejects concurrent and in-flight saves", () => {
    expect(noteAiApplyBlocker({ ...draft, ...clean, knownRemoteRevision: 8 })).toContain("变化");
    expect(noteAiApplyBlocker({ ...draft, ...clean, currentRevision: 8 })).toContain("变化");
    expect(noteAiApplyBlocker({ ...draft, ...clean, isSaving: true })).toContain("未保存");
    expect(noteAiApplyBlocker({ ...draft, ...clean, saveState: "版本冲突" })).toContain("保存");
  });
  it("protects external paragraph edits before applying to a selection", () => {
    expect(noteAiApplyBlocker({ ...draft, scope: "selection", ...clean, currentBody: "外部段落已修改" })).not.toBeNull();
  });
});
