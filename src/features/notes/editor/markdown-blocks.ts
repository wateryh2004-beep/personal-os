import { parser, GFM } from "@lezer/markdown";
import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export type MarkdownBlock = { from: number; to: number; name: string };

/** Complete top-level syntax nodes, never blank-line fragments inside a fence/list/table. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const result: MarkdownBlock[] = [];
  for (let node = parser.configure(GFM).parse(text).topNode.firstChild; node; node = node.nextSibling) {
    result.push({ from: node.from, to: node.to, name: node.name });
  }
  return result;
}

export function editorMarkdownBlocks(state: EditorState): MarkdownBlock[] {
  const result: MarkdownBlock[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    result.push({ from: node.from, to: node.to, name: node.name });
  }
  return result;
}

export function frontmatterBoundary(text: string) { return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)?.[0].length ?? 0; }

export function blockMove(text: string, blocks: readonly MarkdownBlock[], index: number, destination: number) {
  if (index < 0 || destination < 0 || index >= blocks.length || destination >= blocks.length || index === destination) return null;
  const low = Math.min(index, destination), high = Math.max(index, destination);
  const first = blocks[low], last = blocks[high];
  if (first.from < frontmatterBoundary(text) || blocks.slice(low, high + 1).some(block => ["HTMLBlock", "LinkReference"].includes(block.name))) return null;
  const values = blocks.slice(low, high + 1).map((block) => text.slice(block.from, block.to));
  const [moving] = values.splice(index - low, 1);
  values.splice(destination - low, 0, moving);
  // Keep each original inter-block separator byte-for-byte. A single ChangeSet
  // means undo restores the exact original, including unusual whitespace.
  const separators = blocks.slice(low, high).map((block, offset) => { const value = text.slice(block.to, blocks[low + offset + 1].from); return /\n[\t ]*\n/.test(value) ? value : "\n\n"; });
  const insert = values.map((value, offset) => value + (separators[offset] ?? "")).join("");
  const movedFrom = first.from + values.slice(0, destination - low).reduce((sum, value, offset) => sum + value.length + separators[offset].length, 0);
  return { from: first.from, to: last.to, insert, movedFrom };
}
