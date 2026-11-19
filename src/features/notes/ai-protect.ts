import {
  parseInternalNoteLinkOccurrences,
  parseWikiNoteLinkOccurrences,
} from "./links/parser";

/**
 * Preserve Markdown structures as indivisible placeholders during an AI rewrite.
 * A protected structure may move, but its exact bytes and multiplicity must
 * survive the rewrite. The original Markdown remains the only source of truth.
 */
export type ProtectSpan = {
  from: number;
  to: number;
  text: string;
  kind: "codeblock" | "inlinecode" | "link" | "wiki" | "image" | "table" | "callout" | "color";
};
export type ProtectedNote = {
  protected: string;
  count: number;
  restore: (text: string) => string;
  restoreChecked: (text: string) =>
    | { ok: true; text: string }
    | { ok: false; reason: "missing_structure" | "duplicated_structure" | "unknown_placeholder" };
};

const TOKEN_PATTERN = /⟦(\d+)⟧/g;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /(`+)([^`\n]+?)\1/g;
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
const COLOR_RE = /\{\{(?:ink|mark):[a-z][a-z-]*\|[^{}\r\n]+\}\}/g;
const CALLOUT_RE = /^ {0,3}>\s*\[!(?:NOTE|WARNING|IMPORTANT|TIP|QUOTE)\](?:\s+.*)?$/;
const QUOTE_LINE_RE = /^ {0,3}>\s?/;

function findCodeRegions(markdown: string): ProtectSpan[] {
  const spans: ProtectSpan[] = [];
  let cursor = 0;
  let fence: { char: "`" | "~"; length: number } | null = null;
  let blockStart = 0;
  for (const line of markdown.split("\n")) {
    const lineStart = cursor;
    cursor += line.length + 1;
    if (fence) {
      const char = fence.char;
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
  if (fence) spans.push({ from: blockStart, to: markdown.length, text: markdown.slice(blockStart), kind: "codeblock" });
  return spans;
}
function findInlineCode(markdown: string): ProtectSpan[] {
  return [...markdown.matchAll(INLINE_CODE_RE)].map(match => ({
    from: match.index, to: match.index + match[0].length, text: match[0], kind: "inlinecode" as const,
  }));
}
function findImages(markdown: string): ProtectSpan[] {
  return [...markdown.matchAll(IMAGE_RE)].map(match => ({
    from: match.index, to: match.index + match[0].length, text: match[0], kind: "image" as const,
  }));
}
function findColors(markdown: string): ProtectSpan[] {
  return [...markdown.matchAll(COLOR_RE)].map(match => ({
    from: match.index, to: match.index + match[0].length, text: match[0], kind: "color" as const,
  }));
}
function isTableSeparator(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const columns = trimmed.split("|");
  return columns.length >= 2 && columns.every(column => /^:?-{3,}:?$/.test(column.trim()));
}
function findStructuredBlocks(markdown: string): ProtectSpan[] {
  const lines = markdown.split("\n");
  const offsets = [0];
  for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length + 1);
  const spans: ProtectSpan[] = [];
  const push = (i: number, j: number, kind: "table" | "callout") => {
    const from = offsets[i];
    const to = Math.min(offsets[j], markdown.length);
    spans.push({ from, to, text: markdown.slice(from, to), kind });
  };
  for (let i = 0; i < lines.length; i++) {
    if (CALLOUT_RE.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && QUOTE_LINE_RE.test(lines[j])) j++;
      push(i, j, "callout");
      i = j - 1;
      continue;
    }
    if (lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes("|")) j++;
      push(i, j, "table");
      i = j - 1;
    }
  }
  return spans;
}

/** k-way stable merge: a containing code/table/callout span wins over nested links. */
function mergeSpans(groups: ProtectSpan[][]): ProtectSpan[] {
  const ptr = groups.map(() => 0);
  const result: ProtectSpan[] = [];
  for (;;) {
    let best: { g: number; s: ProtectSpan } | null = null;
    for (let g = 0; g < groups.length; g++) {
      const span = groups[g][ptr[g]];
      if (!span) continue;
      if (!best || span.from < best.s.from || (span.from === best.s.from && span.to > best.s.to)) best = { g, s: span };
    }
    if (!best) break;
    ptr[best.g]++;
    const span = best.s;
    if (result.length === 0 || span.from >= result[result.length - 1].to) result.push(span);
  }
  return result;
}

export function collectProtectedNoteSpans(markdown: string): ProtectSpan[] {
  return mergeSpans([
    findCodeRegions(markdown),
    findStructuredBlocks(markdown),
    findColors(markdown),
    findInlineCode(markdown),
    findImages(markdown),
    parseInternalNoteLinkOccurrences(markdown).map(link => ({
      from: link.from, to: link.to, text: markdown.slice(link.from, link.to), kind: "link" as const,
    })),
    parseWikiNoteLinkOccurrences(markdown).map(link => ({
      from: link.from, to: link.to, text: markdown.slice(link.from, link.to), kind: "wiki" as const,
    })),
  ]);
}

/** Exact structural multiset comparison, irrespective of paragraph order. */
export function preservesProtectedNoteStructures(original: string, candidate: string): boolean {
  const counts = new Map<string, number>();
  const key = (span: ProtectSpan) => span.kind + "\u0000" + span.text;
  for (const span of collectProtectedNoteSpans(original)) {
    const k = key(span);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const span of collectProtectedNoteSpans(candidate)) {
    const k = key(span);
    const n = counts.get(k);
    if (!n) return false;
    counts.set(k, n - 1);
  }
  return [...counts.values()].every(n => n === 0);
}

export function protectNoteStructures(markdown: string): ProtectedNote {
  const occupied = new Set<number>();
  for (const match of markdown.matchAll(TOKEN_PATTERN)) occupied.add(Number(match[1]));
  const spans = collectProtectedNoteSpans(markdown);
  const tokenMap = new Map<string, string>();
  let next = 0;
  const takeIndex = () => {
    while (occupied.has(next)) next++;
    return next++;
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
  const restore = (text: string): string =>
    text.replace(TOKEN_PATTERN, full => tokenMap.get(full) ?? full);
  const restoreChecked: ProtectedNote["restoreChecked"] = text => {
    const seen = new Map<string, number>();
    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const token = match[0];
      if (!tokenMap.has(token) && !occupied.has(Number(match[1])))
        return { ok: false, reason: "unknown_placeholder" };
      if (tokenMap.has(token)) seen.set(token, (seen.get(token) ?? 0) + 1);
    }
    for (const token of tokenMap.keys()) {
      if (!seen.has(token)) return { ok: false, reason: "missing_structure" };
      if (seen.get(token) !== 1) return { ok: false, reason: "duplicated_structure" };
    }
    const restored = restore(text);
    if (!preservesProtectedNoteStructures(markdown, restored))
      return { ok: false, reason: "missing_structure" };
    return { ok: true, text: restored };
  };
  return { protected: out, count: spans.length, restore, restoreChecked };
}
