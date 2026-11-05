import { describe, expect, it } from "vitest";
import { analyzeMarkdownCompatibility } from "@/features/notes/editor/compatibility";

describe("Markdown complex documents", () => {
  it("reports unusual structures without modifying the original Markdown", () => {
    const source = "# 标题\n" + "a".repeat(81_000) + "\n| A | B |\n| 1 |\n";
    const items = analyzeMarkdownCompatibility(source);
    expect(items.map(item => item.id)).toContain("large");
    expect(items.map(item => item.id)).toContain("tolerant-table");
    expect(source).toContain("| 1 |");
  });
  it("highlights raw HTML and complex syntax", () => {
    const codeFence = String.fromCharCode(96).repeat(3);
    const source = codeFence + "mermaid\nflowchart LR\n" + codeFence + "\n\n$$\nx+y\n$$\n\n<div>Hi</div>";
    expect(analyzeMarkdownCompatibility(source).map(n => n.id)).toEqual(expect.arrayContaining(["diagram","math","html"]));
  });
  it("does not warn about ordinary GFM", () => {
    expect(analyzeMarkdownCompatibility("# 标题\n\n普通正文")).toEqual([]);
  });
});
