import { markdownLanguage } from "@codemirror/lang-markdown";

/**
 * 目录数据：从 Markdown 源码解析出的标题，供编辑器目录浮层渲染与跳转定位。
 * 用与编辑器同一个 lezer 解析器（markdownLanguage.parser），保证"目录看到的
 * 层级"和"编辑器里实际渲染的层级"完全一致，且天然跳过代码块、行内代码里
 * 的 # 号。
 */
export type MarkdownOutlineItem = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 清理掉 Markdown 标记后的标题文字，用于目录显示。 */
  text: string;
  /** 标题行在文档中的起始 offset，用于跳转。 */
  from: number;
  /** 在目录中的序号，跳转时配合 level+text 精确定位（允许重名标题）。 */
  index: number;
};

const ATX_RE = /^ATXHeading([1-6])$/;

/** 去掉标题里的 Markdown 内联标记，让目录展示的是"读到的字"，不是"源码"。 */
function cleanHeadingText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 解析 Markdown 里的标题。同时覆盖 ATX（# 前缀）与 Setext（下划线）两种写法；
 * 顺序与文档一致，代码块与行内代码里的 # 不会被误判为标题。
 */
export function parseMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  const tree = markdownLanguage.parser.parse(markdown);
  const items: MarkdownOutlineItem[] = [];
  tree.iterate({
    enter(node) {
      const atx = ATX_RE.exec(node.name);
      if (atx) {
        const raw = markdown.slice(node.from, node.to).replace(/^\s*#{1,6}\s*/, "");
        items.push({
          level: Number(atx[1]) as MarkdownOutlineItem["level"],
          text: cleanHeadingText(raw),
          from: node.from,
          index: items.length,
        });
        return false;
      }
      if (node.name === "SetextHeading1" || node.name === "SetextHeading2") {
        const raw = markdown.slice(node.from, node.to).replace(/\s*\n\s*[=-]+\s*$/, "");
        items.push({
          level: node.name === "SetextHeading1" ? 1 : 2,
          text: cleanHeadingText(raw),
          from: node.from,
          index: items.length,
        });
        return false;
      }
      return undefined;
    },
  });
  return items;
}

/**
 * 给定各标题所在的行号（升序）与视口顶部行号，返回"当前正在阅读"的标题：
 * 即最后一个起始行不高于视口顶部的标题；视口还没滚到任何标题时返回 -1。
 * 目录面板用它高亮当前章节。
 */
export function activeHeadingIndexAtLine(headingLines: number[], topLine: number): number {
  let index = -1;
  for (let i = 0; i < headingLines.length; i += 1) {
    if (headingLines[i] <= topLine) index = i;
    else break;
  }
  return index;
}
