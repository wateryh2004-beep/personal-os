import { diffArrays } from "diff";
import { markdownBlocks } from "./editor/markdown-blocks";

export type AdoptionHunk = { id: number; from: number; to: number; before: string; after: string };

function parts(text: string) {
  const blocks = markdownBlocks(text);
  if (!blocks.length) return text ? [text] : [];
  return blocks.map((block, index) => text.slice(index ? block.from : 0, blocks[index + 1]?.from ?? text.length));
}

/** Hunk boundaries follow complete Markdown syntax blocks, including fenced code. */
export function adoptionHunks(before: string, after: string): AdoptionHunk[] | null {
  if (before.length + after.length > 40_000) return null;
  const left = parts(before), right = parts(after);
  if (left.length + right.length > 256) return null;
  const result: AdoptionHunk[] = [];
  let offset = 0;
  for (const part of diffArrays(left, right)) {
    const text = part.value.join("");
    if (!part.added && !part.removed) { offset += text.length; continue; }
    const previous = result.at(-1);
    if (part.added && previous && previous.to === offset && previous.after === "") previous.after = text;
    else result.push({ id: result.length, from: offset, to: offset + (part.removed ? text.length : 0), before: part.removed ? text : "", after: part.added ? text : "" });
    if (part.removed) offset += text.length;
  }
  return result;
}

export function adoptHunks(baseline: string, hunks: readonly AdoptionHunk[], selected: ReadonlySet<number>) {
  let result = baseline;
  for (const hunk of [...hunks].reverse()) {
    if (selected.has(hunk.id)) result = result.slice(0, hunk.from) + hunk.after + result.slice(hunk.to);
  }
  return result;
}
