import "server-only";
import type { AssistantSupabase } from "../tools/types";
import { clipBatch, matchedExcerpt } from "./excerpts";
import { isAiGeneratedNote } from "@/features/notes/content-origin";

export type RetrievedNote = {
  id: string;
  title: string;
  bodyMarkdown: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  contentHash: string;
  href: string;
};

type NoteSearchResult = { entityType: string; entityId: string };
type NoteRecord = { id: string };

export async function excludeAiGeneratedNotes<T extends NoteRecord>(
  supabase: AssistantSupabase,
  notes: T[],
) {
  if (!notes.length) return notes;
  const { data, error } = await supabase.from("notes").select("id,content_origin,ai_visibility").in("id", notes.map((note) => note.id));
  if (error) return notes;
  const humanIds = new Set((data ?? []).filter((note) => !isAiGeneratedNote(note.content_origin) && note.ai_visibility === "normal").map((note) => note.id));
  return notes.filter((note) => humanIds.has(note.id));
}

/** Keep AI-authored Notes searchable in the library, but never send them to an AI as background context. */
export async function excludeAiGeneratedNoteResults<T extends NoteSearchResult>(
  supabase: AssistantSupabase,
  results: T[],
) {
  const noteIds = [...new Set(results.filter((item) => item.entityType === "note").map((item) => item.entityId))];
  if (!noteIds.length) return results;
  const { data, error } = await supabase.from("notes").select("id,content_origin,ai_visibility").in("id", noteIds);
  // Keep search functional during a rolling deployment before the migration is applied.
  if (error) return results;
  const humanIds = new Set((data ?? []).filter((note) => !isAiGeneratedNote(note.content_origin) && note.ai_visibility === "normal").map((note) => note.id));
  return results.filter((item) => item.entityType !== "note" || humanIds.has(item.entityId));
}

const dailyTitle = /^(?:日记|今日日记|Daily Note)\s*[·・:\-]?\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/i;

export async function listRecentNotes(
  supabase: AssistantSupabase,
  input: {
    days: number;
    limit?: number;
    includeDailyNotes?: boolean;
    concepts?: string[];
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,body_markdown,revision,content_hash,created_at,updated_at")
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(Math.min(50, Math.max(1, input.limit ?? 20)));
  if (error) return { notes: [] as RetrievedNote[], unavailable: true };
  const ids = (data ?? []).map((note) => note.id);
  const tagMap = new Map<string, string[]>();
  if (ids.length) {
    const tagResult = await supabase
      .from("note_tags")
      .select("note_id,tags(name)")
      .in("note_id", ids);
    for (const row of tagResult.data ?? []) {
      const related = row.tags as unknown as { name?: string } | Array<{ name?: string }> | null;
      const names = Array.isArray(related)
        ? related.map((tag) => tag.name).filter((name): name is string => Boolean(name))
        : related?.name
          ? [related.name]
          : [];
      tagMap.set(row.note_id, names);
    }
  }
  const notes = (await excludeAiGeneratedNotes(supabase, data ?? []))
    .filter((note) => input.includeDailyNotes !== false || !dailyTitle.test(note.title))
    .map((note) => ({
      id: note.id,
      title: note.title,
      bodyMarkdown: note.body_markdown,
      excerpt: matchedExcerpt(note.body_markdown, input.concepts ?? [], 520),
      tags: tagMap.get(note.id) ?? [],
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      revision: note.revision,
      contentHash: note.content_hash,
      href: `/notes/${note.id}`,
    }));
  return { notes, unavailable: false };
}

export async function readNotesBatch(
  supabase: AssistantSupabase,
  input: {
    noteIds: string[];
    maxNotes?: number;
    maxCharsPerNote?: number;
    maxTotalChars?: number;
  },
) {
  const ids = [...new Set(input.noteIds)].slice(0, Math.min(12, input.maxNotes ?? 8));
  if (!ids.length) return { notes: [] as Array<RetrievedNote & { truncated: boolean }>, unavailable: false };
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,body_markdown,revision,content_hash,created_at,updated_at")
    .in("id", ids)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null);
  if (error) return { notes: [] as Array<RetrievedNote & { truncated: boolean }>, unavailable: true };
  const humanNotes = await excludeAiGeneratedNotes(supabase, data ?? []);
  const byId = new Map(humanNotes.map((note) => [note.id, note]));
  const ordered = ids.flatMap((id) => {
    const note = byId.get(id);
    return note
      ? [{
          id: note.id,
          title: note.title,
          bodyMarkdown: note.body_markdown,
          excerpt: matchedExcerpt(note.body_markdown, [], 520),
          tags: [],
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          revision: note.revision,
          contentHash: note.content_hash,
          href: `/notes/${note.id}`,
        }]
      : [];
  });
  return {
    notes: clipBatch(ordered, {
      maxNotes: Math.min(12, input.maxNotes ?? 8),
      maxCharsPerNote: Math.min(12_000, input.maxCharsPerNote ?? 5_000),
      maxTotalChars: Math.min(40_000, input.maxTotalChars ?? 24_000),
    }),
    unavailable: false,
  };
}
