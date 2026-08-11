import type { InternalNoteLink } from "./types";

export type WikiNoteLink = {
  targetTitle: string;
  label: string;
  from: number;
  to: number;
};

const uuidSource = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const internalNoteLinkPattern = new RegExp(
  `(^|[^!])\\[([^\\]\\n]+)\\]\\((/notes/(${uuidSource}))\\)`,
  "gim",
);
const fullInternalNoteHref = new RegExp(`^/notes/(${uuidSource})$`, "i");
const wikiNoteLinkPattern = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

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

/** Parses hand-written Wiki Links so existing Notes syntax remains bidirectional. */
export function parseWikiNoteLinkOccurrences(markdown: string): WikiNoteLink[] {
  const links: WikiNoteLink[] = [];
  for (const match of markdown.matchAll(wikiNoteLinkPattern)) {
    const targetTitle = (match[1] ?? "").trim();
    const alias = (match[2] ?? "").trim();
    if (!targetTitle) continue;
    const from = match.index ?? 0;
    links.push({ targetTitle, label: alias || targetTitle, from, to: from + match[0].length });
  }
  return links;
}

export function internalNoteIdFromHref(href: string | null | undefined): string | null {
  const match = fullInternalNoteHref.exec(href ?? "");
  return match?.[1]?.toLowerCase() ?? null;
}

export function isInternalNoteHref(href: string | null | undefined) {
  return internalNoteIdFromHref(href) !== null;
}
