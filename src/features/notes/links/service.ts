import type { SupabaseClient } from "@supabase/supabase-js";
import { parseInternalNoteLinkOccurrences } from "./parser";

/**
 * Keeps the derived backlink index aligned with Markdown after an authoritative
 * note save. Only owned, active targets are persisted; raw Markdown stays
 * untouched, so a later deleted target can safely become a broken link.
 */
export async function syncInternalNoteLinks(
  supabase: SupabaseClient,
  userId: string,
  sourceNoteId: string,
  markdown: string,
) {
  const firstLinkByTarget = new Map(
    parseInternalNoteLinkOccurrences(markdown).map((link) => [link.noteId, link]),
  );
  const targetIds = [...firstLinkByTarget.keys()];
  const { data: targets, error: targetError } = targetIds.length
    ? await supabase
      .from("notes")
      .select("id,title")
      .eq("user_id", userId)
      .in("id", targetIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
    : { data: [] as { id: string; title: string }[], error: null };
  if (targetError) return { ok: false, code: targetError.code ?? "lookup_failed" };

  const targetById = new Map((targets ?? []).map((note) => [note.id, note]));
  const rows = [...firstLinkByTarget.values()].flatMap((link) => {
    const target = targetById.get(link.noteId);
    if (!target) return [];
    return [{
      user_id: userId,
      source_note_id: sourceNoteId,
      target_note_id: target.id,
      target_title: target.title || "无标题笔记",
      alias: link.label === target.title ? null : link.label,
      link_type: "markdown",
      position_start: link.from,
      position_end: link.to,
    }];
  });

  const { error: deleteError } = await supabase
    .from("note_links")
    .delete()
    .eq("source_note_id", sourceNoteId)
    .eq("link_type", "markdown");
  if (deleteError) return { ok: false, code: deleteError.code ?? "delete_failed" };
  if (!rows.length) return { ok: true };
  const { error: insertError } = await supabase.from("note_links").insert(rows);
  if (insertError) return { ok: false, code: insertError.code ?? "insert_failed" };
  return { ok: true };
}
