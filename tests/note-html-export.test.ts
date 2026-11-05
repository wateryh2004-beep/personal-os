import { describe, expect, it } from "vitest";
import { renderPortableNoteHtml } from "@/features/notes/export/html";

describe("Portable Notes GFM HTML", () => {
  it("preserves headings, tables, code, links, and printable text without a raster canvas", () => {
    const result = renderPortableNoteHtml("测试文档", [
      "# 一章", "", "| 项目 | 收益 |", "| --- | ---: |", "| A | 25 |", "",
      "~~~ts", "const value = 3;", "~~~", "", "[站内](/notes/example)", "",
      "![图](/api/files/example/download?inline=1)",
    ].join("\n"), true);
    expect(result).toContain("<table>");
    expect(result).toContain("<th");
    expect(result).toContain("const value = 3;");
    expect(result).toContain("保存为 PDF");
    expect(result).toContain("<article>");
    expect(result).not.toContain("html2canvas");
    expect(result).not.toContain("<script");
  });

  it("escapes titles and blocks raw untrusted scripts or event handlers", () => {
    const html = renderPortableNoteHtml("<img src=x onerror=alert(1)>", "<script>alert(1)</script>\n\n[bad](javascript:alert(1))");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=\"javascript:");
  });
});
