import { attachmentRole, type NoteAttachment } from "@/features/notes/attachments";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";
import {
  parseFallbackNoteListItems,
  parseNoteListItems,
  parseNoteMetadataListItems,
} from "./listing";
import type { NoteListItem } from "./types";
import { mergeNoteSearchResults } from "./local-search";
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
  { offset = 0, limit = defaultNotesPageSize, folderId, view = "all" }: {
    offset?: number;
    limit?: number;
    folderId?: string;
    view?: "all" | "favorites" | "recent";
  } = {},
) {
  const boundedOffset = Math.max(0, offset);
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  // Apply the active range before pagination. Filtering a global first page
  // can otherwise declare an older folder empty with no way to load its notes.
  if (folderId || view !== "all") {
    const readScope = async (compatible: boolean) => {
      let query = supabase.from("notes")
        .select(compatible ? "id,title,updated_at,pinned_at" : "id,title,updated_at,pinned_at,folder_id,content_origin")
        .neq("status", "archived");
      if (!compatible) query = query.is("deleted_at", null).neq("status", "trashed");
      if (folderId) query = query.eq("folder_id", folderId);
      else if (view === "favorites") query = query.not("pinned_at", "is", null);
      if (view !== "recent") query = query.order("pinned_at", { ascending: false, nullsFirst: false });
      return query.order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(boundedOffset, boundedOffset + boundedLimit);
    };
    let result = await readScope(false);
    let compatible = false;
    if (!folderId && isNotesWorkspaceSchemaMissing(result.error)) {
      compatible = true;
      result = await readScope(true);
    }
    if (result.error) return { notes: [] as NoteListItem[], hasMore: false, state: "unavailable" as const };
    const parsed = parseNoteMetadataListItems(result.data ?? []);
    return { notes: parsed.slice(0, boundedLimit), hasMore: parsed.length > boundedLimit, state: compatible ? "base" as const : "ready" as const };
  }
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
  navigatorNotes: { id: string; title: string; folder_id: string | null; updated_at: string; content_origin: string | null }[];
}> {
  const { supabase, userId } = owner ?? await withPerfSpan("notes.workspace.auth", () => requireOwner());
  const [profileResult, notesPage, foldersResult, navigatorResult] = await Promise.all([
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
      .order("position").order("name")),
    supabase.from("notes").select("id,title,folder_id,updated_at,content_origin")
      .is("deleted_at", null).neq("status", "archived").order("updated_at", { ascending: false }),
  ]);
  const timezone = profileResult.data?.timezone || "Asia/Shanghai";

  if (notesPage.state === "unavailable") {
    return {
      notes: [],
      folders: [],
      timezone,
      state: "unavailable",
      hasMore: false,
      navigatorNotes: [],
    };
  }
  if (isNotesWorkspaceSchemaMissing(foldersResult.error)) {
    return {
      ...notesPage,
      folders: [],
      timezone,
      state: "base",
      navigatorNotes: [],
    };
  }
  if (foldersResult.error) {
    return {
      notes: [],
      folders: [],
      timezone,
      state: "unavailable",
      hasMore: false,
      navigatorNotes: [],
    };
  }

  return {
    ...notesPage,
    folders: foldersResult.data ?? [],
    timezone,
    state: "ready",
    navigatorNotes: navigatorResult.error ? [] : navigatorResult.data ?? [],
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
  owner?: Owner,
) {
  const normalized = query.trim();
  if (!normalized || (folderId && !noteIdSchema.safeParse(folderId).success)) return [] as NoteListItem[];
  const { supabase, userId } = owner ?? await requireOwner();
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  // A literal regex avoids raw .or() grammar and ILIKE's %, _ and * wildcards.
  const literalQuery = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const readMatches = (column: "title" | "body_markdown") => {
    let request = supabase
      .from("notes")
      .select("id,title,body_markdown,updated_at,pinned_at,folder_id,content_origin")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .neq("status", "archived")
      .neq("status", "trashed")
      .regexIMatch(column, literalQuery)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(boundedLimit);
    if (folderId) request = request.eq("folder_id", folderId);
    return request;
  };
  // Reserve a separate bounded title window so newer body hits cannot hide titles.
  const [titles, bodies] = await Promise.all([readMatches("title"), readMatches("body_markdown")]);
  if (titles.error || bodies.error) throw new Error("notes_search_failed");
  return mergeNoteSearchResults(
    parseFallbackNoteListItems(titles.data ?? [], normalized),
    parseFallbackNoteListItems(bodies.data ?? [], normalized),
    boundedLimit,
    normalized,
  );
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

async function getNoteAttachments(supabase: Supabase, userId: string, noteId: string): Promise<NoteAttachment[]> {
  const links = await supabase.from("entity_links")
    .select("target_id,metadata")
    .eq("user_id", userId).eq("source_type", "note").eq("source_id", noteId)
    .eq("target_type", "document").in("relationship_type", ["attachment", "source"])
    .is("archived_at", null);
  if (links.error || !links.data?.length) return [];
  const files = await supabase.from("documents")
    .select("id,title,original_filename,mime_type,file_size")
    .eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
    .eq("storage_state", "available").is("archived_at", null)
    .in("id", [...new Set(links.data.map((link) => link.target_id))]);
  if (files.error) return [];
  return (files.data ?? []).map((file) => ({ ...file,
    role: attachmentRole(links.data.find((link) => link.target_id === file.id)?.metadata),
  }));
}

export async function getNote(id: string) {
  if (!noteIdSchema.safeParse(id).success) return null;
  const { supabase, userId } = await requireOwner();

  // Independent reads start together, including owner-scoped file metadata. This removes a
  // full Vercel ↔ Supabase round-trip from the document-open critical path.
  const notePromise = supabase.from("notes").select("*").eq("id", id).maybeSingle();
  const versionsPromise = supabase
    .from("note_versions")
    .select("id,version_number,title,body_markdown,reason,created_at")
    .eq("note_id", id)
    .order("version_number", { ascending: false });
  const relationsPromise = getNoteLinkRelations(supabase, id);
  const attachmentsPromise = getNoteAttachments(supabase, userId, id);
  const [noteResult, versionsResult, relations, attachments] = await Promise.all([
    notePromise,
    versionsPromise,
    relationsPromise,
    attachmentsPromise,
  ]);

  if (noteResult.error || !noteResult.data) return null;
  const note = noteResult.data;
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
    attachments,
    state: isNotesWorkspaceSchemaMissing(versionsResult.error) || linksUnavailable ? "base" as const : "ready" as const,
  };
}

export async function getTrashedNotes() {
  const { supabase } = await requireOwner();
  const result = await supabase.from("notes").select("id,title,deleted_at").eq("status", "trashed").order("deleted_at", { ascending: false });
  return result.data ?? [];
}
