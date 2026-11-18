import type { Text } from "@codemirror/state";
import { parseInternalNoteLinkOccurrences } from "@/features/notes/links/parser";
import type { InternalNoteLink } from "@/features/notes/links/types";

type SourceRange = { from: number; to: number };

/**
 * Notes' canonical links are single-line Markdown tokens. Scan only the
 * visible source lines, rather than flattening the entire document on every
 * keystroke, selection change and scroll.
 *
 * Expand each visible range to complete lines so a viewport boundary cannot
 * turn an image link into a note link by hiding its leading "!".
 */
export function internalNoteLinksInVisibleRanges(
  doc: Text,
  ranges: readonly SourceRange[],
): InternalNoteLink[] {
  const links: InternalNoteLink[] = [];
  const seenLines = new Set<number>();
  for (const range of ranges) {
    const start = Math.max(0, Math.min(doc.length, range.from));
    const end = Math.max(start, Math.min(doc.length, range.to));
    const first = doc.lineAt(start).number;
    const last = doc.lineAt(end).number;
    for (let number = first; number <= last; number++) {
      const line = doc.line(number);
      if (seenLines.has(line.from)) continue;
      seenLines.add(line.from);
      for (const link of parseInternalNoteLinkOccurrences(line.text)) {
        const from = line.from + link.from;
        const to = line.from + link.to;
        links.push({ ...link, from, to });
      }
    }
  }
  return links.sort((a, b) => a.from - b.from);
}

/** Hover and Command-click inspect exactly one line, regardless of note size. */
export function internalNoteLinkAtPosition(doc: Text, position: number): InternalNoteLink | null {
  if (position < 0 || position > doc.length) return null;
  const line = doc.lineAt(position);
  for (const link of parseInternalNoteLinkOccurrences(line.text)) {
    const from = line.from + link.from;
    const to = line.from + link.to;
    if (from <= position && position <= to) return { ...link, from, to };
  }
  return null;
}
