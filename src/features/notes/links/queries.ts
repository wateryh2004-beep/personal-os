import { excerptFromMarkdown } from "@/features/notes/listing";
import { rankNoteLinkSuggestions } from "./ranking";
import type { NoteLinkPreview, NoteLinkSuggestion } from "./types";

type Supabase = import("@supabase/supabase-js").SupabaseClient;

function escapeLike(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeSuggestionRows(
  rows: { id: string; title: string; folder_id: string | null; updated_at: string | null }[],
  folders: { id: string; name: string }[],
): NoteLinkSuggestion[] {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  return rows.map((note) => ({
    id: note.id,
    title: note.title || "无标题笔记",
    folderName: note.folder_id ? folderNames.get(note.folder_id) ?? null : null,
    updatedAt: note.updated_at,
  }));
}

export async function listNoteLinkSuggestions(
  supabase: Supabase,
  userId: string,
  query = "",
  limit = 20,
): Promise<NoteLinkSuggestion[]> {
  const safeQuery = query.trim().slice(0, 160);
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  let notesQuery = supabase
    .from("notes")
    .select("id,title,folder_id,updated_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);
  if (safeQuery) notesQuery = notesQuery.ilike("title", `%${escapeLike(safeQuery)}%`);

  const { data: notes, error } = await notesQuery;
  if (error || !notes?.length) return [];
  const folderIds = [...new Set(notes.map((note) => note.folder_id).filter((id): id is string => Boolean(id)))];
  const { data: folders } = folderIds.length
    ? await supabase.from("note_folders").select("id,name").in("id", folderIds).is("archived_at", null)
    : { data: [] as { id: string; name: string }[] };
  return rankNoteLinkSuggestions(normalizeSuggestionRows(notes, folders ?? []), safeQuery);
}

export async function getNoteLinkPreview(
  supabase: Supabase,
  userId: string,
  noteId: string,
): Promise<NoteLinkPreview | null> {
  const { data: note, error } = await supabase
    .from("notes")
    .select("id,title,body_markdown,folder_id,updated_at")
    .eq("id", noteId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !note) return null;
  const { data: folder } = note.folder_id
    ? await supabase.from("note_folders").select("name").eq("id", note.folder_id).is("archived_at", null).maybeSingle()
    : { data: null as { name: string } | null };
  return {
    id: note.id,
    title: note.title || "无标题笔记",
    folderName: folder?.name ?? null,
    updatedAt: note.updated_at,
    excerpt: excerptFromMarkdown(note.body_markdown, 280),
  };
}

export async function getNoteLinkRelations(supabase: Supabase, noteId: string) {
  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("note_links")
      .select("target_note_id")
      .eq("source_note_id", noteId)
      .in("link_type", ["markdown", "wiki"])
      .is("archived_at", null)
      .not("target_note_id", "is", null),
    supabase
      .from("note_links")
      .select("source_note_id")
      .eq("target_note_id", noteId)
      .in("link_type", ["markdown", "wiki"])
      .is("archived_at", null),
  ]);
  if (outgoing.error || incoming.error) return { referenced: [], backlinks: [], unavailable: true };

  const referencedIds = [...new Set((outgoing.data ?? []).map((link) => link.target_note_id).filter((id): id is string => Boolean(id)))];
  const backlinkIds = [...new Set((incoming.data ?? []).map((link) => link.source_note_id))];
  const ids = [...new Set([...referencedIds, ...backlinkIds])];
  if (!ids.length) return { referenced: [], backlinks: [], unavailable: false };
  const { data: notes, error } = await supabase
    .from("notes")
    .select("id,title")
    .in("id", ids)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null);
  if (error) return { referenced: [], backlinks: [], unavailable: true };
  const titles = new Map((notes ?? []).map((note) => [note.id, note.title || "无标题笔记"]));
  const resolve = (id: string) => ({ id, title: titles.get(id) ?? "已删除笔记", available: titles.has(id) });
  return {
    referenced: referencedIds.map(resolve).filter((note) => note.available),
    backlinks: backlinkIds.map(resolve).filter((note) => note.available),
    unavailable: false,
  };
}
