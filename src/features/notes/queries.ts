import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";
import {
  parseFallbackNoteListItems,
  parseNoteListItems,
} from "./listing";
import type { NoteListItem } from "./types";
import { getNoteLinkRelations, listNoteLinkSuggestions } from "./links/queries";

type QueryError = { code?: string } | null;
type Supabase = Awaited<ReturnType<typeof requireOwner>>["supabase"];
type Owner = Awaited<ReturnType<typeof requireOwner>>;
type WorkspaceState = "ready" | "base" | "unavailable";

const defaultNotesPageSize = 100;
const maximumFallbackRows = 200;

/** A production database may temporarily be on the base Notes migration. */
export function isNotesWorkspaceSchemaMissing(error: QueryError) {
  return Boolean(
    error?.code &&
      [
        "PGRST202",
        "PGRST204",
        "PGRST205",
        "42P01",
        "42703",
        "42883",
      ].includes(error.code),
  );
}

async function fallbackNotesPage(
  supabase: Supabase,
  offset: number,
  limit: number,
) {
  if (offset >= maximumFallbackRows) {
    return { notes: [] as NoteListItem[], hasMore: false, state: "base" as const };
  }
  const end = Math.min(offset + limit, maximumFallbackRows - 1);
  const workspaceResult = await supabase
    .from("notes")
    .select("id,title,body_markdown,updated_at,pinned_at,folder_id,content_origin")
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("pinned_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(offset, end);
  let data: unknown = workspaceResult.data;
  let error = workspaceResult.error;

  if (isNotesWorkspaceSchemaMissing(workspaceResult.error)) {
    const baseResult = await supabase
      .from("notes")
      .select("id,title,body_markdown,updated_at,pinned_at,content_origin")
      .neq("status", "archived")
      .order("pinned_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(offset, end);
    data = baseResult.data;
    error = baseResult.error;
  }

  if (error) {
    return { notes: [] as NoteListItem[], hasMore: false, state: "unavailable" as const };
  }

  const parsed = parseFallbackNoteListItems(data ?? []);
  return {
    notes: parsed.slice(0, limit),
    hasMore: parsed.length > limit && offset + limit < maximumFallbackRows,
    state: "base" as const,
  };
}

export async function listNotesWorkspacePage(
  supabase: Supabase,
  { offset = 0, limit = defaultNotesPageSize }: { offset?: number; limit?: number } = {},
) {
  const boundedOffset = Math.max(0, offset);
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const result = await withPerfSpan("notes.workspace.rpc", () => supabase.rpc("list_notes_workspace", {
    p_limit: boundedLimit + 1,
    p_offset: boundedOffset,
  }));

  if (isNotesWorkspaceSchemaMissing(result.error)) {
    return fallbackNotesPage(supabase, boundedOffset, boundedLimit);
  }
  if (result.error) {
    return { notes: [] as NoteListItem[], hasMore: false, state: "unavailable" as const };
  }

  const parsed = parseNoteListItems(result.data ?? []);
  return {
    notes: parsed.slice(0, boundedLimit),
    hasMore: parsed.length > boundedLimit,
    state: "ready" as const,
  };
}

export async function getNotesWorkspace(owner?: Owner): Promise<{
  notes: NoteListItem[];
  folders: { id: string; name: string; parent_id: string | null }[];
  timezone: string;
  state: WorkspaceState;
  hasMore: boolean;
}> {
  const { supabase, userId } = owner ?? await withPerfSpan("notes.workspace.auth", () => requireOwner());
  const [profileResult, notesPage, foldersResult] = await Promise.all([
    withPerfSpan("notes.workspace.profile", () => supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle()),
    listNotesWorkspacePage(supabase),
    withPerfSpan("notes.workspace.folders", () => supabase
      .from("note_folders")
      .select("id,name,parent_id")
      .is("archived_at", null)
      .order("position")),
  ]);
  const timezone = profileResult.data?.timezone || "Asia/Shanghai";

  if (notesPage.state === "unavailable") {
    return {
      notes: [],
      folders: [],
      timezone,
      state: "unavailable",
      hasMore: false,
    };
  }
  if (isNotesWorkspaceSchemaMissing(foldersResult.error)) {
    return {
      ...notesPage,
      folders: [],
      timezone,
      state: "base",
    };
  }
  if (foldersResult.error) {
    return {
      notes: [],
      folders: [],
      timezone,
      state: "unavailable",
      hasMore: false,
    };
  }

  return {
    ...notesPage,
    folders: foldersResult.data ?? [],
    timezone,
    state: "ready",
  };
}

/**
 * The navigator deliberately fetches only file metadata. Unlike the paginated
 * index this is the complete owner-scoped tree, so folder expansion never
 * pretends that the first page of notes is the whole library.
 */
export async function getNotesNavigator(): Promise<{
  folders: { id: string; name: string; parent_id: string | null }[];
  notes: { id: string; title: string; folder_id: string | null; updated_at: string; content_origin: string | null }[];
}> {
  const { supabase } = await requireOwner();
  const [foldersResult, notesResult] = await Promise.all([
    supabase
      .from("note_folders")
      .select("id,name,parent_id")
      .is("archived_at", null)
      .order("position")
      .order("name"),
    supabase
      .from("notes")
      .select("id,title,folder_id,updated_at,content_origin")
      .is("deleted_at", null)
      .neq("status", "archived")
      .order("updated_at", { ascending: false }),
  ]);
  if (foldersResult.error || notesResult.error) return { folders: [], notes: [] };
  return { folders: foldersResult.data ?? [], notes: notesResult.data ?? [] };
}

export async function searchNotesWorkspace(
  query: string,
  folderId: string | null,
  limit = 30,
) {
  const normalized = query.trim();
  if (!normalized) return [] as NoteListItem[];
  const { supabase } = await requireOwner();
  let request = supabase
    .from("notes")
    .select("id,title,body_markdown,updated_at,pinned_at,folder_id,content_origin")
    .is("deleted_at", null)
    .neq("status", "archived")
    .or(`title.ilike.%${normalized.replace(/[%_,()]/g, " ")}%,body_markdown.ilike.%${normalized.replace(/[%_,()]/g, " ")}%`)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (folderId && noteIdSchema.safeParse(folderId).success) request = request.eq("folder_id", folderId);
  const { data, error } = await request;
  if (error) return [] as NoteListItem[];
  return parseFallbackNoteListItems(data ?? []);
}

/** Folder metadata for controls that move an already-authorized note. */
export async function getActiveNoteFolders() {
  const { supabase } = await requireOwner();
  const result = await supabase
    .from("note_folders")
    .select("id,name,parent_id")
    .is("archived_at", null)
    .order("position")
    .order("name");

  if (isNotesWorkspaceSchemaMissing(result.error) || result.error) return [];
  return result.data ?? [];
}

/** Lightweight, server-provided index used by the editor before it performs any search request. */
export async function getRecentNoteLinkSuggestions(limit = 35) {
  const { supabase, userId } = await requireOwner();
  return listNoteLinkSuggestions(supabase, userId, "", limit);
}

const noteIdSchema = z.string().uuid();

export async function getNote(id: string) {
  if (!noteIdSchema.safeParse(id).success) return null;
  const { supabase } = await requireOwner();
  const noteResult = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  if (noteResult.error || !noteResult.data) return null;
  const note = noteResult.data;
  // These reads do not depend on one another. Keeping them sequential made a
  // document open pay a full network round-trip for versions and another for
  // link relations after the note body had already arrived.
  const versionsPromise = supabase
    .from("note_versions")
    .select("id,version_number,title,body_markdown,reason,created_at")
    .eq("note_id", id)
    .order("version_number", { ascending: false });
  const relationsPromise = getNoteLinkRelations(supabase, id);
  const [versionsResult, relations] = await Promise.all([versionsPromise, relationsPromise]);
  const versions = isNotesWorkspaceSchemaMissing(versionsResult.error)
    ? await supabase
      .from("note_versions")
      .select("id,version_number,title,body_markdown,created_at")
      .eq("note_id", id)
      .order("version_number", { ascending: false })
    : versionsResult;
  const linksUnavailable = relations.unavailable;
  return {
    note: { ...note, revision: note.revision ?? 0, last_saved_at: note.last_saved_at ?? null },
    versions: (versions.data ?? []).map((version) => ({ ...version, reason: (version as { reason?: string }).reason ?? "initial" })),
    links: relations.referenced,
    backlinks: relations.backlinks,
    state: isNotesWorkspaceSchemaMissing(versionsResult.error) || linksUnavailable ? "base" as const : "ready" as const,
  };
}

export async function getTrashedNotes() {
  const { supabase } = await requireOwner();
  const result = await supabase.from("notes").select("id,title,deleted_at").eq("status", "trashed").order("deleted_at", { ascending: false });
  return result.data ?? [];
}
