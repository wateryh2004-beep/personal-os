import { z } from "zod";
import type { NoteListItem } from "./types";

const noteListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  excerpt: z.string(),
  updated_at: z.string(),
  pinned_at: z.string().nullable(),
  folder_id: z.string().uuid().nullable(),
});

const fallbackNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body_markdown: z.string(),
  updated_at: z.string(),
  pinned_at: z.string().nullable(),
  folder_id: z.string().uuid().nullable().optional(),
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

export function parseNoteListItems(input: unknown): NoteListItem[] {
  return z.array(noteListItemSchema).parse(input);
}

export function parseFallbackNoteListItems(input: unknown): NoteListItem[] {
  return z.array(fallbackNoteSchema).parse(input).map((note) => ({
    id: note.id,
    title: note.title,
    excerpt: excerptFromMarkdown(note.body_markdown),
    updated_at: note.updated_at,
    pinned_at: note.pinned_at,
    folder_id: note.folder_id ?? null,
  }));
}
