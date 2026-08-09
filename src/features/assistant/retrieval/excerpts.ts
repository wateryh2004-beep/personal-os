const plainText = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function matchedExcerpt(
  source: string,
  concepts: string[],
  maxChars = 360,
) {
  const text = plainText(source);
  if (text.length <= maxChars) return text;
  const lower = text.toLocaleLowerCase();
  const positions = concepts
    .map((concept) => lower.indexOf(concept.toLocaleLowerCase()))
    .filter((position) => position >= 0);
  const hit = positions.length ? Math.min(...positions) : 0;
  const before = Math.floor(maxChars * 0.32);
  const start = Math.max(0, Math.min(hit - before, text.length - maxChars));
  const excerpt = text.slice(start, start + maxChars).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + maxChars < text.length ? "…" : ""}`;
}

export function clipBatch<T extends { bodyMarkdown: string }>(
  notes: T[],
  options: { maxNotes: number; maxCharsPerNote: number; maxTotalChars: number },
) {
  const results: Array<T & { truncated: boolean }> = [];
  let used = 0;
  for (const note of notes.slice(0, options.maxNotes)) {
    if (used >= options.maxTotalChars) break;
    const available = Math.min(options.maxCharsPerNote, options.maxTotalChars - used);
    const bodyMarkdown = note.bodyMarkdown.slice(0, available);
    results.push({
      ...note,
      bodyMarkdown,
      truncated: bodyMarkdown.length < note.bodyMarkdown.length,
    });
    used += bodyMarkdown.length;
  }
  return results;
}
