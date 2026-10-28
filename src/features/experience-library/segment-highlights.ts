import type { ExperienceMedia, ExperienceSegment } from "./types";

/** Keep the original text intact while marking both image selections and AI quotations. */
export function experienceSegmentHighlights(segment: ExperienceSegment, linked: ExperienceMedia | undefined, quotes: string[]) {
  const ranges: { start: number; end: number }[] = [];
  if (linked?.selectionStart !== null && linked?.selectionStart !== undefined && linked.selectionEnd !== null) {
    const start = Math.max(0, linked.selectionStart - segment.start);
    const end = Math.min(segment.text.length, linked.selectionEnd - segment.start);
    if (start < end) ranges.push({ start, end });
  }
  for (const quote of new Set(quotes)) {
    if (!quote) continue;
    const start = segment.text.indexOf(quote);
    if (start >= 0) ranges.push({ start, end: start + quote.length });
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
