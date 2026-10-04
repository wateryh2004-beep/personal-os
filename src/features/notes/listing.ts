import { z } from "zod";
import type { NoteListItem } from "./types";
import { noteSearchMatchRanges } from "./local-search";

const noteListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  // Always null from the RPC listing (browsing shows no snippet); search and
  // the fallback listing populate it via excerptFromMarkdown.
  excerpt: z.string().nullable(),
  updated_at: z.string(),
  pinned_at: z.string().nullable(),
  folder_id: z.string().uuid().nullable(),
  // Optional so an un-migrated remote listing still parses; null hides the AI badge.
  content_origin: z.string().nullable().optional(),
});

const fallbackNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body_markdown: z.string(),
  updated_at: z.string(),
  pinned_at: z.string().nullable(),
  folder_id: z.string().uuid().nullable().optional(),
  content_origin: z.string().nullable().optional(),
});

export function excerptFromMarkdown(markdown: string, maxLength = 220) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[`#>*_~|\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** A plain-text window around a body match, with no HTML or markup injection. */
export function searchExcerptFromMarkdown(markdown: string, query: string, maxLength = 220) {
  const budget = Math.max(0, Math.floor(maxLength));
  if (!budget) return "";
  const raw = markdown.replace(/\s+/g, " ").trim();
  let text = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`#>*_~|\[\]()]/g, " ")
    .replace(/\s+/g, " ").trim();
  const findMatch = (value: string) => noteSearchMatchRanges(value, query, { wholeQuery: true, firstOnly: true })[0]
    ?? noteSearchMatchRanges(value, query, { firstOnly: true })[0];
  let match = findMatch(text);
  // URL or Markdown punctuation searches still show the literal text that matched.
  if (!match) {
    const rawMatch = findMatch(raw);
    if (rawMatch) { text = raw; match = rawMatch; }
  }
  const contentBudget = Math.max(0, budget - 2);
  // Keep the match within two narrow mobile lines, including near the body end.
  const context = Math.min(24, Math.max(0, Math.floor((contentBudget - (match ? match.end - match.start : 0)) / 2)));
  if (text.length <= budget && (!match || match.start <= context)) return text;
  const wantedStart = Math.max(0, (match?.start ?? 0) - context);
  const wantedEnd = Math.min(text.length, wantedStart + contentBudget);
  // Avoid chopping surrogate pairs, combining accents or joined emoji at either edge.
  const segments = new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text);
  const startPart = segments.containing(wantedStart);
  const start = startPart && startPart.index < wantedStart ? startPart.index + startPart.segment.length : wantedStart;
  const end = segments.containing(wantedEnd)?.index ?? text.length;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`.slice(0, budget);
}

export function parseNoteListItems(input: unknown): NoteListItem[] {
  return z.array(noteListItemSchema).parse(input).map((note) => ({
    id: note.id,
    title: note.title,
    excerpt: note.excerpt,
    updated_at: note.updated_at,
    pinned_at: note.pinned_at,
    folder_id: note.folder_id,
    content_origin: note.content_origin ?? null,
  }));
}

/** Folder/favorite pages never fetch document bodies, including on the base schema. */
export function parseNoteMetadataListItems(input: unknown): NoteListItem[] {
  const schema = noteListItemSchema.omit({ excerpt: true }).extend({ folder_id: z.string().uuid().nullable().optional() });
  return z.array(schema).parse(input).map((note) => ({ ...note, folder_id: note.folder_id ?? null, content_origin: note.content_origin ?? null, excerpt: null }));
}

export function parseFallbackNoteListItems(input: unknown, query?: string): NoteListItem[] {
  return z.array(fallbackNoteSchema).parse(input).map((note) => ({
    id: note.id,
    title: note.title,
    excerpt: query ? searchExcerptFromMarkdown(note.body_markdown, query) : excerptFromMarkdown(note.body_markdown),
    updated_at: note.updated_at,
    pinned_at: note.pinned_at,
    folder_id: note.folder_id ?? null,
    content_origin: note.content_origin ?? null,
  }));
}
