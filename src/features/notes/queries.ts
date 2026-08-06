import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";

type QueryError = { code?: string } | null;

/** A production database may temporarily be on the base Notes migration. */
export function isNotesWorkspaceSchemaMissing(error: QueryError) {
  return Boolean(error?.code && ["PGRST204", "PGRST205", "42P01", "42703"].includes(error.code));
}

type WorkspaceState = "ready" | "base" | "unavailable";

export async function getNotesWorkspace(): Promise<{
  notes: { id: string; title: string; updated_at: string; pinned_at: string | null; folder_id: string | null }[];
  folders: { id: string; name: string; parent_id: string | null }[];
  state: WorkspaceState;
}> {
  const { supabase } = await requireOwner();
  const notesResult = await supabase
    .from("notes")
    .select("id,title,updated_at,pinned_at,folder_id")
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("pinned_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (isNotesWorkspaceSchemaMissing(notesResult.error)) {
    const base = await supabase
      .from("notes")
      .select("id,title,updated_at,pinned_at")
      .neq("status", "archived")
      .order("pinned_at", { ascending: false })
      .order("updated_at", { ascending: false });
    if (base.error) return { notes: [], folders: [], state: "unavailable" };
    return {
      notes: (base.data ?? []).map((note) => ({ ...note, folder_id: null })),
      folders: [],
      state: "base",
    };
  }
  if (notesResult.error) return { notes: [], folders: [], state: "unavailable" };

  const foldersResult = await supabase
    .from("note_folders")
    .select("id,name,parent_id")
    .is("archived_at", null)
    .order("position");
  if (isNotesWorkspaceSchemaMissing(foldersResult.error)) {
    return { notes: notesResult.data ?? [], folders: [], state: "base" };
  }
  if (foldersResult.error) return { notes: [], folders: [], state: "unavailable" };
  return { notes: notesResult.data ?? [], folders: foldersResult.data ?? [], state: "ready" };
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
