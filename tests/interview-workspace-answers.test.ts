import { describe, expect, it } from "vitest";
import { selectWorkspaceAnswer, type WorkspaceAnswer } from "@/features/interview/workspace-answers";
const answer = (patch: Partial<WorkspaceAnswer> = {}): WorkspaceAnswer => ({ id: "draft", preparation_id: "prep", answer_mode: "spoken", target_seconds: null, language: "zh", body_markdown: "可以直接阅读的完整回答", version_number: 1, status: "draft", source: "ai_draft", confirmed_at: null, updated_at: "2026-10-01T00:00:00Z", ...patch });
describe("workspace answer selection", () => {
  it("shows an unconfirmed draft without changing its metadata", () => {
    const draft = answer(); expect(selectWorkspaceAnswer([draft])).toBe(draft);
    expect(draft).toMatchObject({ status: "draft", source: "ai_draft", confirmed_at: null });
  });
  it("prefers adopted current to newer drafts", () => {
    const current = answer({ id: "current", status: "current", updated_at: "2026-01-01" });
    expect(selectWorkspaceAnswer([answer(), current])).toBe(current);
  });
  it.each(["zh", "en", "bilingual"])("prefers %s within a status", (language) => {
    const match = answer({ id: language, language });
    const other = answer({ id: "other", language: language === "en" ? "zh" : "en", updated_at: "2026-11-01" });
    expect(selectWorkspaceAnswer([other, match], language)).toBe(match);
  });
  it("uses bilingual before the other monolingual fallback", () => {
    expect(selectWorkspaceAnswer([answer({ id: "en", language: "en" }), answer({ id: "bi", language: "bilingual" })], "zh")?.id).toBe("bi");
  });
  it("ignores empty, retired, archived, and non-spoken versions", () => {
    const draft = answer();
    expect(selectWorkspaceAnswer([answer({ status: "current", body_markdown: " \n " }), answer({ status: "retired" }), answer({ archived_at: "2026-10-01" }), answer({ answer_mode: "outline" }), draft])).toBe(draft);
    expect(selectWorkspaceAnswer([])).toBeNull();
  });
  it("chooses latest usable draft without mutating the input", () => {
    const older = answer(), newest = answer({ id: "newest", version_number: 2, updated_at: "2026-10-02" });
    const rows = [older, newest]; expect(selectWorkspaceAnswer(rows)).toBe(newest); expect(rows).toEqual([older, newest]);
  });
});
