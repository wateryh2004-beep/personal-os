import { describe, expect, it } from "vitest";
import { noteAiSections } from "@/features/notes/editor/ai-section-scope";
describe("Notes AI chapter selection", () => {
  it("selects nested chapters without changing any original source bytes", () => {
    const doc = "前言。\n\n# 第一章\n一。\n## 小节\n二。\n# 第二章\n三。\n";
    const sections = noteAiSections(doc);
    expect(sections.map(x => x.title)).toEqual(["开头（首个标题前）", "第一章", "小节", "第二章"]);
    expect(doc.slice(sections[1].from, sections[1].to)).toBe("# 第一章\n一。\n## 小节\n二。\n");
    expect(doc.slice(sections[2].from, sections[2].to)).toBe("## 小节\n二。\n");
    expect(doc.slice(sections[3].from)).toBe("# 第二章\n三。\n");
  });
  it("ignores markdown headings in fenced code and quotes", () => {
    const doc = "```md\n# 假标题\n```\n> # 引用标题\n# 真标题\n正文";
    const sections = noteAiSections(doc);
    expect(sections).toHaveLength(2);
    expect(sections[1].title).toBe("真标题");
  });
});
