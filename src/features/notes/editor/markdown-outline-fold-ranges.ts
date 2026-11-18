import type { Text } from "@codemirror/state";
import type { MarkdownOutlineItem } from "./markdown-outline";

export type OutlineFoldRange = { from: number; to: number };

/**
 * Outline rendering needs every fold button at once. Calling
 * headingSectionRange for each heading repeatedly scans the rest of the
 * document (quadratic with many headings). The already parsed, ordered
 * outline lets us compute all ATX fold ranges in one reverse pass.
 *
 * Setext headings are not fold boundaries for the existing ATX folding
 * command. Retain that behavior rather than silently changing section scope.
 */
export function outlineFoldRanges(
  doc: Text,
  items: readonly MarkdownOutlineItem[],
): Map<number, OutlineFoldRange> {
  const result = new Map<number, OutlineFoldRange>();
  const next = [] as Array<{ level: number; from: number }>;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.from < 0 || item.from > doc.length) continue;
    const line = doc.lineAt(item.from);
    if (item.from !== line.from) continue;
    const heading = /^ {0,3}(#{1,6})\s+/.exec(line.text);
    if (!heading || heading[1].length !== item.level) continue;
    while (next.length && next[next.length - 1].level > item.level) next.pop();
    const end = next.length ? Math.max(line.to, next[next.length - 1].from - 1) : doc.length;
    if (end > line.to + 1) result.set(item.index, { from: line.to, to: end });
    next.push({ level: item.level, from: item.from });
  }
  return result;
}
