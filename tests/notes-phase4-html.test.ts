import { describe, expect, it } from "vitest";
import { renderNoteHtml } from "@/features/notes/export/html";

describe("portable Notes HTML and printable PDF source", () => {
  it("escapes document titles and sanitizes untrusted Markdown HTML", () => {
    const html = renderNoteHtml({
      title: '<script>alert("x")</script>',
      markdown: '# 正文\n\n| 项目 | 值 |\n| --- | --- |\n| 甲 | 3 |\n\n<script>alert("x")</script>',
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<table>");
    expect(html).toContain("正文");
    expect(html).not.toContain("<script>");
  });
  it("uses actual selectable HTML text and a printer-friendly A4 stylesheet", () => {
    const html = renderNoteHtml({ title: "研究笔记", markdown: "可搜索的中文 **文字**", printable: true });
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<strong>文字</strong>");
    expect(html).toContain("@page{size:A4");
    expect(html).toContain("保存为 PDF");
    expect(html).not.toContain("<canvas");
  });
});
