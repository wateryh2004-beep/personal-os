"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { contentHash } from "./utils";
import { getOrCreateDailyNote } from "./daily-note-service";
import { syncInternalNoteLinks } from "./links/service";
import { syncEntityReferenceLinks } from "@/features/links/service";
import { noteRelationSignature } from "./links/signature";
import { noteContentOrigins } from "./content-origin";
import { recordStatusSafely } from "@/features/system-status/service";
const noteSchema = z.object({ noteId: z.string().uuid().optional(), expectedRevision: z.coerce.number().int().min(0), title: z.string().max(240), bodyMarkdown: z.string().max(200000) });
const folderSchema = z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().nullable().optional() });
function fail(): never { throw new Error("操作未能完成，请检查输入、权限或网络后重试。"); }
function missingWorkspaceColumn(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PGRST204"); }
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityType: string, id: string, data: Record<string, unknown>) { const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: entityType, entity_id: id, actor_type: "user", after_data: data }); if (error) fail(); }
export async function createNote() { const { supabase, userId } = await requireOwner(); const title = "无标题笔记"; const body = ""; const hash = contentHash(body); let result = await supabase.from("notes").insert({ user_id: userId, title, body_markdown: body, status: "active", revision: 1, content_hash: hash, word_count: 0, character_count: 0, last_saved_at: new Date().toISOString() }).select("id").single(); if (result.error && missingWorkspaceColumn(result.error)) result = await supabase.from("notes").insert({ user_id: userId, title, body_markdown: body, status: "active" }).select("id").single(); if (result.error) fail(); const version = await supabase.from("note_versions").insert({ user_id: userId, note_id: result.data.id, title, body_markdown: body, version_number: 1, created_by: userId, content_hash: hash, revision: 1, reason: "initial" }); if (version.error && missingWorkspaceColumn(version.error)) { const fallback = await supabase.from("note_versions").insert({ user_id: userId, note_id: result.data.id, title, body_markdown: body, version_number: 1, created_by: userId }); if (fallback.error) fail(); } else if (version.error) fail(); await audit(supabase, userId, "create", "note", result.data.id, { revision: 1 }); const now = new Date().toISOString(); await recordStatusSafely(userId, "notes", { state: "fresh", lastSuccessAt: now, lastAttemptAt: now, nextStep: "Notes 直接以 Supabase 为权威。" }, { type: "succeeded", operationKey: `note-create-${result.data.id}` }); redirect(`/notes/${result.data.id}`); }
export async function saveNote(input: unknown) { const { supabase, userId } = await requireOwner(); const parsed = noteSchema.safeParse(input); if (!parsed.success || !parsed.data.noteId) fail(); const value = parsed.data; const previous = await supabase.from("notes").select("body_markdown").eq("id", value.noteId).eq("revision", value.expectedRevision).maybeSingle(); const hash = contentHash(value.bodyMarkdown); const words = value.bodyMarkdown.trim() ? value.bodyMarkdown.trim().split(/\s+/).length : 0; const now = new Date().toISOString(); const { data, error } = await supabase.from("notes").update({ title: value.title || "无标题笔记", body_markdown: value.bodyMarkdown, content_hash: hash, word_count: words, character_count: value.bodyMarkdown.length, last_saved_at: now, revision: value.expectedRevision + 1 }).eq("id", value.noteId).eq("revision", value.expectedRevision).select("id,revision").maybeSingle(); if (error && missingWorkspaceColumn(error)) { const fallback = await supabase.from("notes").update({ title: value.title || "无标题笔记", body_markdown: value.bodyMarkdown }).eq("id", value.noteId).select("id").maybeSingle(); if (fallback.error || !fallback.data) fail(); await recordStatusSafely(userId, "notes", { state: "fresh", lastSuccessAt: now, lastAttemptAt: now, nextStep: "Notes 直接以 Supabase 为权威。" }, { type: "succeeded", operationKey: `note-save-${value.noteId}-${value.expectedRevision}` }); return { status: "saved" as const, revision: value.expectedRevision, lastSavedAt: now }; } if (error) fail(); if (!data) { await recordStatusSafely(userId, "notes", { state: "conflict", lastAttemptAt: now, conflictSummary: "此笔记已在另一处更新，尚未覆盖权威版本。", nextStep: "刷新笔记并比较版本后再保存。" }, { type: "conflict_detected", operationKey: `note-save-${value.noteId}-${value.expectedRevision}` }); return { status: "conflict" as const }; } await recordStatusSafely(userId, "notes", { state: "fresh", lastSuccessAt: now, lastAttemptAt: now, nextStep: "Notes 直接以 Supabase 为权威。" }, { type: "succeeded", operationKey: `note-save-${value.noteId}-${data.revision}` }); if (previous.error || noteRelationSignature(previous.data?.body_markdown ?? "") !== noteRelationSignature(value.bodyMarkdown)) { const linkSync = await syncInternalNoteLinks(supabase, userId, value.noteId!, value.bodyMarkdown); if (!linkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_note_links", noteId: value.noteId, code: linkSync.code })); const entityLinkSync = await syncEntityReferenceLinks(supabase, userId, "note", value.noteId!, value.bodyMarkdown); if (!entityLinkSync.ok) console.error(JSON.stringify({ level: "warn", action: "sync_entity_reference_links", noteId: value.noteId, code: entityLinkSync.code })); }
  // Autosave returns its canonical revision to the mounted editor. Invalidating
  // the Notes routes here caused every typing pause to refetch the RSC tree.
  return { status: "saved" as const, revision: data.revision, lastSavedAt: now };
}
export async function createFolder(formData: FormData) { const { supabase, userId } = await requireOwner(); const raw = Object.fromEntries(formData); const parsed = folderSchema.safeParse({ name: raw.name, parentId: raw.parent_id || null }); if (!parsed.success) fail(); if (parsed.data.parentId) { const { data } = await supabase.from("note_folders").select("id").eq("id", parsed.data.parentId).maybeSingle(); if (!data) fail(); } const existingQuery = supabase.from("note_folders").select("id").ilike("name", parsed.data.name).is("archived_at", null); const existing = await (parsed.data.parentId ? existingQuery.eq("parent_id", parsed.data.parentId) : existingQuery.is("parent_id", null)).maybeSingle(); if (existing.data) fail(); const { data, error } = await supabase.from("note_folders").insert({ user_id: userId, name: parsed.data.name, parent_id: parsed.data.parentId ?? null }).select("id").single(); if (error || !data) fail(); await audit(supabase, userId, "create", "note_folder", data.id, { parent_id: parsed.data.parentId ?? null }); revalidatePath("/notes"); return { id: data.id }; }
export async function trashNote(formData: FormData) { const { supabase, userId } = await requireOwner(); const id = String(formData.get("note_id") || ""); const { data, error } = await supabase.from("notes").update({ status: "trashed", deleted_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle(); if (error || !data) fail(); await audit(supabase, userId, "trash", "note", id, {}); revalidatePath("/notes"); redirect("/notes"); }
export async function restoreNote(formData: FormData) { const { supabase, userId } = await requireOwner(); const id = String(formData.get("note_id") || ""); const { data, error } = await supabase.from("notes").update({ status: "active", deleted_at: null, archived_at: null }).eq("id", id).select("id").maybeSingle(); if (error || !data) fail(); await audit(supabase, userId, "restore", "note", id, {}); revalidatePath("/notes"); revalidatePath("/notes/trash"); }
export async function archiveNote(formData: FormData) { const { supabase, userId } = await requireOwner(); const id = String(formData.get("note_id") || ""); const { data, error } = await supabase.from("notes").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle(); if (error || !data) fail(); await audit(supabase, userId, "archive", "note", id, {}); revalidatePath("/notes"); redirect("/notes"); }
export async function createNoteVersion(formData: FormData) { const { supabase, userId } = await requireOwner(); const id = String(formData.get("note_id") || ""); const { data: note } = await supabase.from("notes").select("id,title,body_markdown,content_hash,revision").eq("id", id).maybeSingle(); if (!note) fail(); const { data: latest } = await supabase.from("note_versions").select("version_number,content_hash").eq("note_id", id).order("version_number", { ascending: false }).limit(1).maybeSingle(); if (latest?.content_hash && latest.content_hash === note.content_hash) return; const version = await supabase.from("note_versions").insert({ user_id: userId, note_id: id, title: note.title, body_markdown: note.body_markdown, version_number: (latest?.version_number ?? 0) + 1, created_by: userId, content_hash: note.content_hash, revision: note.revision, reason: "manual" }); if (version.error) fail(); await audit(supabase, userId, "create_version", "note", id, { revision: note.revision }); revalidatePath(`/notes/${id}`); }
export async function restoreNoteVersion(formData: FormData) { const { supabase, userId } = await requireOwner(); const noteId = String(formData.get("note_id") || ""); const versionId = String(formData.get("version_id") || ""); const [{ data: note }, { data: version }, { data: latest }] = await Promise.all([supabase.from("notes").select("*").eq("id", noteId).maybeSingle(), supabase.from("note_versions").select("*").eq("id", versionId).eq("note_id", noteId).maybeSingle(), supabase.from("note_versions").select("version_number").eq("note_id", noteId).order("version_number", { ascending: false }).limit(1).maybeSingle()]); if (!note || !version) fail(); const snapshot = await supabase.from("note_versions").insert({ user_id: userId, note_id: noteId, title: note.title, body_markdown: note.body_markdown, version_number: (latest?.version_number ?? 0) + 1, created_by: userId, content_hash: note.content_hash, revision: note.revision, reason: "before_restore" }); if (snapshot.error) fail(); const { error } = await supabase.from("notes").update({ title: version.title, body_markdown: version.body_markdown, content_hash: version.content_hash, revision: (note.revision ?? 0) + 1, last_saved_at: new Date().toISOString() }).eq("id", noteId); if (error) fail(); await audit(supabase, userId, "restore_version", "note", noteId, { version_id: versionId }); revalidatePath(`/notes/${noteId}`); }

const notePlacementSchema = z.object({ folderId: z.string().uuid().nullable().optional() });
const moveNoteSchema = z.object({ noteId: z.string().uuid(), folderId: z.string().uuid().nullable().optional() });
const moveFolderSchema = z.object({ folderId: z.string().uuid(), parentId: z.string().uuid().nullable().optional() });
const renameNoteSchema = z.object({ noteId: z.string().uuid(), title: z.string().trim().min(1).max(240) });
const renameFolderSchema = z.object({ folderId: z.string().uuid(), name: z.string().trim().min(1).max(120) });
const noteContentOriginSchema = z.object({ noteId: z.string().uuid(), contentOrigin: z.enum(noteContentOrigins) });
const folderIdSchema = z.string().uuid();

/** Labels a note's provenance without changing its Markdown or revision. */
export async function setNoteContentOrigin(input: unknown) {
  const parsed = noteContentOriginSchema.safeParse(input);
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const { data: note, error } = await supabase
    .from("notes")
    .update({ content_origin: parsed.data.contentOrigin })
    .eq("id", parsed.data.noteId)
    .is("deleted_at", null)
    .select("id,content_origin")
    .maybeSingle();
  if (error || !note) fail();
  await audit(supabase, userId, "set_content_origin", "note", note.id, {
    content_origin: note.content_origin,
  });
  revalidatePath("/notes");
  revalidatePath(`/notes/${note.id}`);
  return { contentOrigin: note.content_origin };
}

async function ownedFolderId(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], value: string | null | undefined) {
  const parsed = notePlacementSchema.safeParse({ folderId: value || null });
  if (!parsed.success) fail();
  if (!parsed.data.folderId) return null;
  const { data } = await supabase.from("note_folders").select("id").eq("id", parsed.data.folderId).is("archived_at", null).maybeSingle();
  if (!data) fail();
  return data.id;
}

export async function moveNote(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = moveNoteSchema.safeParse({
    noteId: formData.get("note_id"),
    folderId: String(formData.get("folder_id") || "") || null,
  });
  if (!parsed.success) fail();

  // RLS scopes this lookup to the current user; the explicit row check avoids
  // treating an unknown/deleted note as a successful move.
  const { data: note, error: noteError } = await supabase
    .from("notes")
    .select("id,folder_id")
    .eq("id", parsed.data.noteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (noteError || !note) fail();

  const targetFolderId = await ownedFolderId(supabase, parsed.data.folderId);
  if (note.folder_id === targetFolderId) return;

  const { data: moved, error } = await supabase
    .from("notes")
    .update({ folder_id: targetFolderId })
    .eq("id", note.id)
    .select("id")
    .maybeSingle();
  if (error || !moved) fail();

  await audit(supabase, userId, "move", "note", note.id, {
    from_folder_id: note.folder_id,
    to_folder_id: targetFolderId,
  });
  revalidatePath("/notes");
  revalidatePath(`/notes/${note.id}`);
}

export async function moveFolder(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = moveFolderSchema.safeParse({
    folderId: formData.get("folder_id"),
    parentId: String(formData.get("parent_id") || "") || null,
  });
  if (!parsed.success) fail();

  const { data: folder, error: folderError } = await supabase
    .from("note_folders")
    .select("id,name,parent_id")
    .eq("id", parsed.data.folderId)
    .is("archived_at", null)
    .maybeSingle();
  if (folderError || !folder) fail();

  const targetParentId = await ownedFolderId(supabase, parsed.data.parentId);
  if (folder.parent_id === targetParentId) return;
  if (targetParentId === folder.id) fail();

  // Inspect the entire owner-scoped tree before reparenting. This makes a
  // circular hierarchy impossible even if a client bypasses drag safeguards.
  if (targetParentId) {
    const { data: tree, error: treeError } = await supabase
      .from("note_folders")
      .select("id,parent_id")
      .is("archived_at", null);
    if (treeError) fail();
    const byId = new Map((tree ?? []).map((item) => [item.id, item]));
    const seen = new Set<string>();
    let current = byId.get(targetParentId);
    while (current && !seen.has(current.id)) {
      if (current.id === folder.id) fail();
      seen.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }

  let duplicateQuery = supabase
    .from("note_folders")
    .select("id")
    .ilike("name", folder.name)
    .neq("id", folder.id)
    .is("archived_at", null);
  duplicateQuery = targetParentId
    ? duplicateQuery.eq("parent_id", targetParentId)
    : duplicateQuery.is("parent_id", null);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError || duplicate) fail();

  const { data: moved, error } = await supabase
    .from("note_folders")
    .update({ parent_id: targetParentId })
    .eq("id", folder.id)
    .select("id")
    .maybeSingle();
  if (error || !moved) fail();
  await audit(supabase, userId, "move", "note_folder", folder.id, {
    from_parent_id: folder.parent_id,
    to_parent_id: targetParentId,
  });
  revalidatePath("/notes");
}

export async function renameNote(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = renameNoteSchema.safeParse({ noteId: formData.get("note_id"), title: formData.get("title") });
  if (!parsed.success) fail();
  const { data: note, error: noteError } = await supabase.from("notes").select("id,title").eq("id", parsed.data.noteId).is("deleted_at", null).maybeSingle();
  if (noteError || !note) fail();
  if (note.title === parsed.data.title) return;
  const { data: renamed, error } = await supabase.from("notes").update({ title: parsed.data.title }).eq("id", note.id).select("id").maybeSingle();
  if (error || !renamed) fail();
  await audit(supabase, userId, "rename", "note", note.id, { previous_title: note.title, title: parsed.data.title });
  revalidatePath("/notes");
  revalidatePath(`/notes/${note.id}`);
}

export async function renameFolder(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = renameFolderSchema.safeParse({
    folderId: formData.get("folder_id"),
    name: formData.get("name"),
  });
  if (!parsed.success) fail();
  const { data: folder, error: folderError } = await supabase
    .from("note_folders")
    .select("id,name,parent_id")
    .eq("id", parsed.data.folderId)
    .is("archived_at", null)
    .maybeSingle();
  if (folderError || !folder) fail();
  if (folder.name === parsed.data.name) return;

  let duplicateQuery = supabase
    .from("note_folders")
    .select("id")
    .ilike("name", parsed.data.name)
    .neq("id", folder.id)
    .is("archived_at", null);
  duplicateQuery = folder.parent_id
    ? duplicateQuery.eq("parent_id", folder.parent_id)
    : duplicateQuery.is("parent_id", null);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError || duplicate) fail();

  const { data: renamed, error } = await supabase
    .from("note_folders")
    .update({ name: parsed.data.name })
    .eq("id", folder.id)
    .select("id")
    .maybeSingle();
  if (error || !renamed) fail();
  await audit(supabase, userId, "rename", "note_folder", folder.id, {
    previous_name: folder.name,
    name: parsed.data.name,
  });
  revalidatePath("/notes");
}

export async function toggleNotePinned(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const noteId = String(formData.get("note_id") || "");
  if (!z.string().uuid().safeParse(noteId).success) fail();
  const { data: note, error: noteError } = await supabase
    .from("notes")
    .select("id,pinned_at")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (noteError || !note) fail();
  const pinnedAt = note.pinned_at ? null : new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("notes")
    .update({ pinned_at: pinnedAt })
    .eq("id", note.id)
    .select("id")
    .maybeSingle();
  if (error || !updated) fail();
  await audit(supabase, userId, pinnedAt ? "pin" : "unpin", "note", note.id, { pinned_at: pinnedAt });
  revalidatePath("/notes");
  revalidatePath(`/notes/${note.id}`);
}

export async function deleteEmptyFolder(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const folderId = String(formData.get("folder_id") || "");
  if (!folderIdSchema.safeParse(folderId).success) fail();
  const { data: folder, error: folderError } = await supabase.from("note_folders").select("id,name").eq("id", folderId).maybeSingle();
  if (folderError || !folder) fail();
  const [{ count: noteCount, error: noteError }, { count: childCount, error: childError }] = await Promise.all([
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("folder_id", folder.id),
    supabase.from("note_folders").select("id", { count: "exact", head: true }).eq("parent_id", folder.id),
  ]);
  // Do not cascade: archived and trashed notes also make a folder non-empty.
  if (noteError || childError || noteCount || childCount) fail();
  const { data: deleted, error } = await supabase.from("note_folders").delete().eq("id", folder.id).select("id").maybeSingle();
  if (error || !deleted) fail();
  await audit(supabase, userId, "delete", "note_folder", folder.id, { name: folder.name, empty: true });
  revalidatePath("/notes");
  redirect("/notes?folder=deleted");
}

export async function recordNotePdfExport(noteId: string) {
  const { supabase, userId } = await requireOwner();
  if (!z.string().uuid().safeParse(noteId).success) fail();
  const { data: note, error } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .maybeSingle();
  if (error || !note) fail();
  await audit(supabase, userId, "export", "note", note.id, { format: "pdf", renderer: "local_markdown_preview" });
}

export async function createNoteInFolder(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const folderId = await ownedFolderId(supabase, String(formData.get("folder_id") || ""));
  const title = "无标题笔记";
  const body = "";
  const hash = contentHash(body);
  const { data: note, error } = await supabase.from("notes").insert({ user_id: userId, folder_id: folderId, title, body_markdown: body, status: "active", revision: 1, content_hash: hash, word_count: 0, character_count: 0, last_saved_at: new Date().toISOString() }).select("id").single();
  if (error || !note) fail();
  const version = await supabase.from("note_versions").insert({ user_id: userId, note_id: note.id, title, body_markdown: body, version_number: 1, created_by: userId, content_hash: hash, revision: 1, reason: "initial" });
  if (version.error) fail();
  await audit(supabase, userId, "create", "note", note.id, { revision: 1, folder_id: folderId });
  redirect(`/notes/${note.id}`);
}

async function openDailyNoteInternal() {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const note = await getOrCreateDailyNote(
    supabase,
    userId,
    profile?.timezone || "Asia/Shanghai",
  );
  if (!note.created) {
    await audit(supabase, userId, "organize_daily_note", "note", note.id, {
      date: note.date,
    });
  }
  revalidatePath("/notes");
  redirect(`/notes/${note.id}`);
}

function isRedirect(error: unknown) {
  return Boolean(error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string" && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"));
}

export async function openDailyNote() {
  try {
    await openDailyNoteInternal();
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error(JSON.stringify({ level: "error", action: "open_daily_note", error: error instanceof Error ? error.message : "unknown" }));
    redirect("/notes?daily=error");
  }
}
