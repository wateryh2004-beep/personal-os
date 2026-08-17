import {
  parseInternalNoteLinkOccurrences,
  parseWikiNoteLinkOccurrences,
} from "./links/parser";

/**
 * Notes AI 结构保护：润色/改写前，把笔记里的内部链接、双链、图片与代码块
 * 替换成 ⟦N⟧ 占位符发给模型，模型碰不到这些"像乱码"的结构；返回后再按 key
 * 还原。占位符用数学白方块括号 + 十进制索引：不撞 Markdown 语法、不撞真实
 * 内容（对原文已有的 ⟦k⟧ 跳号）、模型不易剥离、可唯一还原。
 */
export type ProtectSpan = {
  /** 半开区间 [from, to)，字符偏移 */
  from: number;
  to: number;
  /** 被保护结构的原始文本（还原用） */
  text: string;
  kind: "codeblock" | "inlinecode" | "link" | "wiki" | "image";
};

export type ProtectedNote = {
  /** 发给模型的内容（结构 → ⟦N⟧） */
  protected: string;
  /** 保护了多少个结构 */
  count: number;
  /** 模型输出 → 还原真实结构 */
  restore: (text: string) => string;
};

const TOKEN_PATTERN = /⟦(\d+)⟧/g;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /(`+)([^`\n]+?)\1/g;
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;

/**
 * 阶段一：围栏代码块。整块（含围栏）为一个 span，块内的 [[...]]、[x](/notes/uuid)、
 * ![](...) 都是代码内容，天然被排除在链接/图片保护之外。未闭合的围栏保护到文末。
 */
function findCodeRegions(markdown: string): ProtectSpan[] {
  const spans: ProtectSpan[] = [];
  let cursor = 0;
  let fence: { char: "`" | "~"; length: number } | null = null;
  let blockStart = 0;
  for (const line of markdown.split("\n")) {
    const lineStart = cursor;
    cursor += line.length + 1; // +1 换行；末尾 slice 自动收敛
    if (fence) {
      const char = fence.char === "`" ? "`" : "~";
      const closer = new RegExp(`^ {0,3}${char}{${fence.length},}\\s*$`).test(line);
      if (closer) {
        const to = Math.min(lineStart + line.length + 1, markdown.length);
        spans.push({ from: blockStart, to, text: markdown.slice(blockStart, to), kind: "codeblock" });
        fence = null;
      }
    } else {
      const match = FENCE_OPEN_RE.exec(line);
      if (match) {
        fence = { char: match[1][0] as "`" | "~", length: match[1].length };
        blockStart = lineStart;
      }
    }
  }
  if (fence) {
    spans.push({ from: blockStart, to: markdown.length, text: markdown.slice(blockStart), kind: "codeblock" });
  }
  return spans;
}

function findInlineCode(markdown: string): ProtectSpan[] {
  const spans: ProtectSpan[] = [];
  for (const match of markdown.matchAll(INLINE_CODE_RE)) {
    spans.push({ from: match.index, to: match.index + match[0].length, text: match[0], kind: "inlinecode" });
  }
  return spans;
}

function findImages(markdown: string): ProtectSpan[] {
  const spans: ProtectSpan[] = [];
  for (const match of markdown.matchAll(IMAGE_RE)) {
    spans.push({ from: match.index, to: match.index + match[0].length, text: match[0], kind: "image" });
  }
  return spans;
}

/**
 * k 路归并：各来源的匹配天然按 from 升序。重叠时保留外层（先出现、更长者）——
 * 代码块整块先入，块内的链接/图片/双链自然被丢弃；同起点取长。
 */
function mergeSpans(groups: ProtectSpan[][]): ProtectSpan[] {
  const ptr = groups.map(() => 0);
  const result: ProtectSpan[] = [];
  for (;;) {
    let best: { g: number; s: ProtectSpan } | null = null;
    for (let g = 0; g < groups.length; g++) {
      const span = groups[g][ptr[g]];
      if (!span) continue;
      if (!best || span.from < best.s.from || (span.from === best.s.from && span.to > best.s.to)) {
        best = { g, s: span };
      }
    }
    if (!best) break;
    ptr[best.g]++;
    const span = best.s;
    if (result.length === 0 || span.from >= result[result.length - 1].to) {
      result.push(span);
    }
  }
  return result;
}

export function protectNoteStructures(markdown: string): ProtectedNote {
  // 记录原文中已存在的 ⟦数字⟧，给新 token 跳号，保证占位符不与真实内容碰撞。
  const occupied = new Set<number>();
  for (const match of markdown.matchAll(TOKEN_PATTERN)) occupied.add(Number(match[1]));

  const groups: ProtectSpan[][] = [
    findCodeRegions(markdown),
    findInlineCode(markdown),
    findImages(markdown),
    parseInternalNoteLinkOccurrences(markdown).map((link) => ({
      from: link.from,
      to: link.to,
      text: markdown.slice(link.from, link.to),
      kind: "link" as const,
    })),
    parseWikiNoteLinkOccurrences(markdown).map((link) => ({
      from: link.from,
      to: link.to,
      text: markdown.slice(link.from, link.to),
      kind: "wiki" as const,
    })),
  ];
  const spans = mergeSpans(groups);

  const tokenMap = new Map<string, string>();
  let next = 0;
  const takeIndex = () => {
    while (occupied.has(next)) next += 1;
    const value = next;
    next += 1;
    return value;
  };

  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += markdown.slice(cursor, span.from);
    const token = `⟦${takeIndex()}⟧`;
    tokenMap.set(token, span.text);
    out += token;
    cursor = span.to;
  }
  out += markdown.slice(cursor);

  // 还原按 key 查表，模型重排/复用/只保留一部分占位符都能正确还原；
  // 模型自己新造的 ⟦k⟧（不在 map）原样保留。
  const restore = (text: string): string =>
    text.replace(TOKEN_PATTERN, (full) => tokenMap.get(full) ?? full);

  return { protected: out, count: spans.length, restore };
}
