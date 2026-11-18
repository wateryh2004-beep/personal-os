import "server-only";

import type { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";
import { contentHash } from "./utils";

type OwnerClient = Awaited<ReturnType<typeof requireOwner>>["supabase"];
type CreateInput = {
  supabase: OwnerClient;
  userId: string;
  noteId: string;
  folderId: string | null;
  span: "notes.create" | "notes.create_in_folder";
};

const errorMessage = "操作未能完成，请检查输入、权限或网络后重试。";
const missingRpcCodes = new Set(["PGRST202", "42883"]);

function fail(): never {
  throw new Error(errorMessage);
}

function missingWorkspaceColumn(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PGRST204");
}

/**
 * One RPC round trip persists the note, version and audit in a single RLS
 * transaction. The same client-generated note UUID is reused on uncertain
 * retries. A missing RPC is the only permitted fallback during the migration
 * rollout; permission or data errors must never silently downgrade.
 */
export async function createEmptyNotePersisted({
  supabase, userId, noteId, folderId, span,
}: CreateInput): Promise<string> {
  const response = await withPerfSpan(`${span}.atomic_rpc`, () =>
    supabase.rpc("create_empty_note_atomic", {
      p_note_id: noteId,
      p_folder_id: folderId,
    }),
  );

  if (!response.error) {
    if (response.data !== noteId) fail();
    return noteId;
  }
  if (!missingRpcCodes.has(response.error.code ?? "")) fail();

  // Old deployment still running before the migration: preserve the original
  // Server Action behaviour and required audit/version checks, rather than
  // letting a temporarily missing RPC break creation entirely.
  if (process.env.PERF_DEBUG === "true") {
    console.info(JSON.stringify({ type: "perf", span: `${span}.legacy_fallback` }));
  }

  if (folderId) {
    const folder = await withPerfSpan(`${span}.folder_fallback`, () =>
      supabase.from("note_folders")
        .select("id")
        .eq("id", folderId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .is("vault_group_id", null)
        .maybeSingle());
    if (folder.error || !folder.data) fail();
  }

  const title = "无标题笔记";
  const body = "";
  const hash = contentHash(body);
  let result = await withPerfSpan(`${span}.record_fallback`, () =>
    supabase.from("notes")
      .insert({
        id: noteId, user_id: userId, folder_id: folderId,
        title, body_markdown: body, status: "active",
        revision: 1, content_hash: hash, word_count: 0,
        character_count: 0, last_saved_at: new Date().toISOString(),
      })
      .select("id").single());

  if (result.error && missingWorkspaceColumn(result.error)) {
    result = await withPerfSpan(`${span}.record_compat`, () =>
      supabase.from("notes")
        .insert({ id: noteId, user_id: userId, folder_id: folderId, title, body_markdown: body, status: "active" })
        .select("id").single());
  }

  // A lost response may have committed the legacy path. Do not create a new
  // note for the same form ID. Verify an owner-scoped complete old transaction
  // before treating it as success.
  if (result.error?.code === "23505" && await confirmedLegacyRetry(supabase, userId, noteId)) {
    return noteId;
  }
  if (result.error || !result.data) fail();

  const version = await withPerfSpan(`${span}.version_fallback`, () =>
    supabase.from("note_versions")
      .insert({
        user_id: userId, note_id: noteId, title, body_markdown: body,
        version_number: 1, created_by: userId, content_hash: hash, revision: 1, reason: "initial",
      }));
  if (version.error && missingWorkspaceColumn(version.error)) {
    const compat = await withPerfSpan(`${span}.version_compat`, () =>
      supabase.from("note_versions")
        .insert({ user_id: userId, note_id: noteId, title, body_markdown: body, version_number: 1, created_by: userId }));
    if (compat.error) fail();
  } else if (version.error) fail();

  const audit = await withPerfSpan(`${span}.audit_fallback`, () =>
    supabase.from("audit_logs")
      .insert({
        user_id: userId, action: "create", entity_type: "note",
        entity_id: noteId, actor_type: "user",
        request_id: noteId, after_data: { revision: 1, folder_id: folderId },
      }));
  if (audit.error && missingWorkspaceColumn(audit.error)) {
    const compat = await supabase.from("audit_logs")
      .insert({
        user_id: userId, action: "create", entity_type: "note",
        entity_id: noteId, actor_type: "user", after_data: { revision: 1, folder_id: folderId },
      });
    if (compat.error) fail();
  } else if (audit.error) fail();
  return noteId;
}

async function confirmedLegacyRetry(supabase: OwnerClient, userId: string, noteId: string) {
  const [note, version, audit] = await Promise.all([
    supabase.from("notes").select("id").eq("id", noteId).eq("user_id", userId).maybeSingle(),
    supabase.from("note_versions").select("id").eq("note_id", noteId).eq("user_id", userId).eq("version_number", 1).maybeSingle(),
    supabase.from("audit_logs").select("id").eq("entity_id", noteId).eq("entity_type", "note").eq("action", "create").eq("request_id", noteId).eq("user_id", userId).maybeSingle(),
  ]);
  return !note.error && !version.error && !audit.error &&
    Boolean(note.data && version.data && audit.data);
}
