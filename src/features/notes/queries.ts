import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  parseFallbackNoteListItems,
  parseNoteListItems,
} from "./listing";
import type { NoteListItem } from "./types";

type QueryError = { code?: string } | null;
type Supabase = Awaited<ReturnType<typeof requireOwner>>["supabase"];
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
    .select("id,title,body_markdown,updated_at,pinned_at,folder_id")
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
      .select("id,title,body_markdown,updated_at,pinned_at")
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
  const result = await supabase.rpc("list_notes_workspace", {
    p_limit: boundedLimit + 1,
    p_offset: boundedOffset,
  });

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

export async function getNotesWorkspace(): Promise<{
  notes: NoteListItem[];
  folders: { id: string; name: string; parent_id: string | null }[];
  timezone: string;
  state: WorkspaceState;
  hasMore: boolean;
}> {
  const { supabase, userId } = await requireOwner();
  const [profileResult, notesPage, foldersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle(),
    listNotesWorkspacePage(supabase),
    supabase
      .from("note_folders")
      .select("id,name,parent_id")
      .is("archived_at", null)
      .order("position"),
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

const noteIdSchema = z.string().uuid();

export async function getNote(id: string) {
  if (!noteIdSchema.safeParse(id).success) return null;
  const { supabase } = await requireOwner();
  const noteResult = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  if (noteResult.error || !noteResult.data) return null;
  const note = noteResult.data;
  const versionsResult = await supabase
    .from("note_versions")
    .select("id,version_number,title,body_markdown,reason,created_at")
    .eq("note_id", id)
    .order("version_number", { ascending: false });
  const versions = isNotesWorkspaceSchemaMissing(versionsResult.error)
    ? await supabase
      .from("note_versions")
      .select("id,version_number,title,body_markdown,created_at")
      .eq("note_id", id)
      .order("version_number", { ascending: false })
    : versionsResult;
  const linksResult = await supabase.from("note_links").select("*").eq("source_note_id", id).is("archived_at", null);
  const backlinksResult = await supabase.from("note_links").select("source_note_id,target_title,alias").eq("target_note_id", id).is("archived_at", null);
  const linksUnavailable = isNotesWorkspaceSchemaMissing(linksResult.error) || isNotesWorkspaceSchemaMissing(backlinksResult.error);
  return {
    note: { ...note, revision: note.revision ?? 0, last_saved_at: note.last_saved_at ?? null },
    versions: (versions.data ?? []).map((version) => ({ ...version, reason: (version as { reason?: string }).reason ?? "initial" })),
    links: linksUnavailable ? [] : linksResult.data ?? [],
    backlinks: linksUnavailable ? [] : backlinksResult.data ?? [],
    state: isNotesWorkspaceSchemaMissing(versionsResult.error) || linksUnavailable ? "base" as const : "ready" as const,
  };
}

export async function getTrashedNotes() {
  const { supabase } = await requireOwner();
  const result = await supabase.from("notes").select("id,title,deleted_at").eq("status", "trashed").order("deleted_at", { ascending: false });
  return result.data ?? [];
}
