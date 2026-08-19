import { describe, expect, it } from "vitest";
import { parseMarkdownOutline } from "@/features/notes/editor/markdown-outline";

describe("parseMarkdownOutline", () => {
  it("解析 ATX 标题的层级、文字与顺序", () => {
    const doc = "# 一级\n\n## 二级\n\n### 三级\n\n正文\n\n## 又一个二级\n";
    const items = parseMarkdownOutline(doc);
    expect(items).toEqual([
      { level: 1, text: "一级", from: doc.indexOf("# 一级"), index: 0 },
      { level: 2, text: "二级", from: doc.indexOf("## 二级"), index: 1 },
      { level: 3, text: "三级", from: doc.indexOf("### 三级"), index: 2 },
      { level: 2, text: "又一个二级", from: doc.indexOf("## 又一个二级"), index: 3 },
    ]);
  });

  it("不把代码块里的 # 当作标题", () => {
    const doc = "# 真标题\n\n```\n# 代码块\n## 也是代码\n```\n\n正文";
    const items = parseMarkdownOutline(doc);
    expect(items.map((item) => item.text)).toEqual(["真标题"]);
  });

  it("不把行内代码里的 # 当作标题", () => {
    const doc = "# 标题\n\n`# 不是标题`";
    const items = parseMarkdownOutline(doc);
    expect(items.map((item) => item.text)).toEqual(["标题"]);
  });

  it("解析 Setext 标题，单独的 --- 是分隔线不是标题", () => {
    const doc = "大标题\n=======\n\n小标题\n-------\n\n---\n\n段落";
    const items = parseMarkdownOutline(doc);
    expect(items).toEqual([
      { level: 1, text: "大标题", from: doc.indexOf("大标题"), index: 0 },
      { level: 2, text: "小标题", from: doc.indexOf("小标题"), index: 1 },
    ]);
  });

  it("清理标题里的内联标记", () => {
    const doc =
      "# **粗体**与 `代码`\n\n## [链接文字](https://example.com)\n\n### 图片 ![示意图](x.png)\n";
    const items = parseMarkdownOutline(doc);
    expect(items.map((item) => item.text)).toEqual(["粗体与 代码", "链接文字", "图片 示意图"]);
  });

  it("空内容返回空目录", () => {
    expect(parseMarkdownOutline("")).toEqual([]);
    expect(parseMarkdownOutline("只有一段正文，没有标题")).toEqual([]);
  });
});
