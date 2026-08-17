import { diffArrays } from "diff";

export type DiffSegment = {
  type: "equal" | "insert" | "delete";
  text: string;
};

/** 前后文合计超过该字符数时回退纯预览，避免大文档 diff 卡顿与内存压力。 */
export const WORD_DIFF_CHAR_CAP = 40_000;

/**
 * CJK 感知分词：`diffWords` 按空白切词，中文没有空格会被整句当成一个 token，
 * 一个词的改动会显示成整句删除+整句新增。这里把每个 CJK 字符拆成独立 token，
 * 英文/数字/ASCII 仍按词切，得到"中文按字、英文按词"的粒度。
 */
const TOKEN_RE = /[一-鿿　-〿＀-￯]|\s+|[^\s一-鿿　-〿＀-￯]+/g;

export function tokenizeForDiff(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

/**
 * 词级 diff：对比润色前后的文本。改写类操作在预览里用它对改动做高亮，
 * 结构占位符还原后两侧一致，链接/双链/图片/代码块自然显示为"无改动"。
 * 超过字符上限时返回 null，由调用方回退到纯文本预览。
 */
export function wordDiff(before: string, after: string): DiffSegment[] | null {
  if (before.length + after.length > WORD_DIFF_CHAR_CAP) return null;
  return diffArrays(tokenizeForDiff(before), tokenizeForDiff(after)).map((part) => ({
    type: part.added ? "insert" : part.removed ? "delete" : "equal",
    text: part.value.join(""),
  }));
}
