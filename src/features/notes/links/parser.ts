import type { InternalNoteLink } from "./types";

const uuidSource = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const internalNoteLinkPattern = new RegExp(
  `(^|[^!])\\[([^\\]\\n]+)\\]\\((/notes/(${uuidSource}))\\)`,
  "gim",
);
const fullInternalNoteHref = new RegExp(`^/notes/(${uuidSource})$`, "i");

/** Parses only canonical same-origin Notes Markdown links. */
export function parseInternalNoteLinkOccurrences(markdown: string): InternalNoteLink[] {
  const links: InternalNoteLink[] = [];
  for (const match of markdown.matchAll(internalNoteLinkPattern)) {
    const prefix = match[1] ?? "";
    const label = (match[2] ?? "").trim();
    const noteId = match[4]?.toLowerCase();
    const index = match.index ?? 0;
    if (!label || !noteId) continue;
    const from = index + prefix.length;
    links.push({ noteId, label, from, to: from + match[0].length - prefix.length });
  }
  return links;
}

export function parseInternalNoteLinks(markdown: string): string[] {
  return [...new Set(parseInternalNoteLinkOccurrences(markdown).map((link) => link.noteId))];
}

export function internalNoteIdFromHref(href: string | null | undefined): string | null {
  const match = fullInternalNoteHref.exec(href ?? "");
  return match?.[1]?.toLowerCase() ?? null;
}

export function isInternalNoteHref(href: string | null | undefined) {
  return internalNoteIdFromHref(href) !== null;
}
