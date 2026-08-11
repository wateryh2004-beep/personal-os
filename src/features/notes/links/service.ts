import type { SupabaseClient } from "@supabase/supabase-js";
import { parseInternalNoteLinkOccurrences, parseWikiNoteLinkOccurrences } from "./parser";

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
  const firstMarkdownLinkByTarget = new Map(
    parseInternalNoteLinkOccurrences(markdown).map((link) => [link.noteId, link]),
  );
  const wikiLinks = parseWikiNoteLinkOccurrences(markdown);
  const targetIds = [...firstMarkdownLinkByTarget.keys()];
  const wikiTitles = [...new Set(wikiLinks.map((link) => link.targetTitle))];
  const { data: markdownTargets, error: markdownTargetError } = targetIds.length
    ? await supabase
      .from("notes")
      .select("id,title")
      .eq("user_id", userId)
      .in("id", targetIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
    : { data: [] as { id: string; title: string }[], error: null };
  if (markdownTargetError) return { ok: false, code: markdownTargetError.code ?? "lookup_failed" };

  const { data: wikiTargets, error: wikiTargetError } = wikiTitles.length
    ? await supabase
      .from("notes")
      .select("id,title")
      .eq("user_id", userId)
      .in("title", wikiTitles)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
    : { data: [] as { id: string; title: string }[], error: null };
  if (wikiTargetError) return { ok: false, code: wikiTargetError.code ?? "lookup_failed" };

  const targetById = new Map((markdownTargets ?? []).map((note) => [note.id, note]));
  const targetByTitle = new Map((wikiTargets ?? []).map((note) => [note.title, note]));
  const markdownRows = [...firstMarkdownLinkByTarget.values()].flatMap((link) => {
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
  const wikiRows = wikiLinks.flatMap((link) => {
    const target = targetByTitle.get(link.targetTitle);
    if (!target) return [];
    return [{
      user_id: userId,
      source_note_id: sourceNoteId,
      target_note_id: target.id,
      target_title: target.title || "无标题笔记",
      alias: link.label === target.title ? null : link.label,
      link_type: "wiki",
      position_start: link.from,
      position_end: link.to,
    }];
  });
  const rows = [...markdownRows, ...wikiRows];

  const { error: deleteError } = await supabase
    .from("note_links")
    .delete()
    .eq("source_note_id", sourceNoteId)
    .in("link_type", ["markdown", "wiki"]);
  if (deleteError) return { ok: false, code: deleteError.code ?? "delete_failed" };
  if (!rows.length) return { ok: true };
  const { error: insertError } = await supabase.from("note_links").insert(rows);
  if (insertError) return { ok: false, code: insertError.code ?? "insert_failed" };
  return { ok: true };
}
