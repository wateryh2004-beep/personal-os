import { describe, expect, it } from "vitest";
import { noteAiSelectionContext } from "@/features/notes/ai-prompts";

describe("noteAiSelectionContext", () => {
  it("returns empty string when no surrounding context exists", () => {
    expect(noteAiSelectionContext({})).toBe("");
    expect(noteAiSelectionContext({ before: "", after: "  " })).toBe("");
  });

  it("includes both sides when present and constrains output to the selection", () => {
    const result = noteAiSelectionContext({
      before: "上文紧邻内容",
      after: "下文紧邻内容",
    });
    expect(result).toContain("上文紧邻内容");
    expect(result).toContain("下文紧邻内容");
    expect(result).toContain("不要包含选区之外的文字");
  });

  it("supports only one side", () => {
    const result = noteAiSelectionContext({ before: "仅在文首" });
    expect(result).toContain("仅在文首");
    expect(result).not.toContain("紧邻的下文");
  });
});
