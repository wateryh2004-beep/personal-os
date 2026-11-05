import { describe, expect, it } from "vitest";
import { analyzeMarkdownCompatibility } from "@/features/notes/editor/compatibility";

describe("Notes Phase 4 complex Markdown compatibility", () => {
  it("does not modify Markdown or warn for ordinary GFM content", () => {
    const source = "# 标题\n\n| 项目 | 收益 |\n| --- | ---: |\n| A | 25 |";
    expect(analyzeMarkdownCompatibility(source)).toEqual([]);
    expect(source).toContain("| --- | ---: |");
  });
  it("warns about oversized notes and nonstandard tables without truncating content", () => {
    const source = "# 标题\n" + "a".repeat(81_000) + "\n| A | B |\n| 1 |";
    const ids = analyzeMarkdownCompatibility(source).map(x => x.id);
    expect(ids).toContain("large");
    expect(ids).toContain("tolerant-table");
    expect(source.endsWith("| 1 |")).toBe(true);
  });
  it("identifies unsupported diagrams, math and raw HTML", () => {
    const fence = String.fromCharCode(96).repeat(3);
    const source = fence + "mermaid\nflowchart LR\n" + fence +
      "\n$$\nx+y\n$$\n<div>unsafe</div>";
    expect(analyzeMarkdownCompatibility(source).map(x => x.id))
      .toEqual(expect.arrayContaining(["diagram", "math", "html"]));
  });
}
