import { describe, expect, it } from "vitest";
import { isAiGeneratedNote, noteContentOriginLabel } from "@/features/notes/content-origin";

describe("note content origin", () => {
  it("treats only explicitly marked notes as AI-generated", () => {
    expect(isAiGeneratedNote("ai_generated")).toBe(true);
    expect(isAiGeneratedNote("human")).toBe(false);
    expect(isAiGeneratedNote(null)).toBe(false);
  });

  it("keeps the editor label concise and reversible", () => {
    expect(noteContentOriginLabel("ai_generated")).toBe("AI 生成");
    expect(noteContentOriginLabel("human")).toBe("人工内容");
  });
});
