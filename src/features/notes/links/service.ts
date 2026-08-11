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

  // The backlink index is derived state, but it is updated during every
  // autosave.  Diff it instead of deleting/reinserting all rows so ordinary
  // prose edits with unchanged links produce zero note_links mutations.
  const { data: existing, error: existingError } = await supabase
    .from("note_links")
    .select("id,target_note_id,target_title,alias,link_type,position_start,position_end")
    .eq("source_note_id", sourceNoteId)
    .in("link_type", ["markdown", "wiki"]);
  if (existingError) return { ok: false, code: existingError.code ?? "lookup_failed" };
  const key = (row: { target_note_id: string; target_title: string; alias: string | null; link_type: string; position_start: number; position_end: number }) =>
    [row.target_note_id, row.target_title, row.alias ?? "", row.link_type, row.position_start, row.position_end].join("\u0001");
  const nextByKey = new Map(rows.map((row) => [key(row), row]));
  const currentByKey = new Map((existing ?? []).map((row) => [key(row), row]));
  const removedIds = [...currentByKey.entries()].filter(([rowKey]) => !nextByKey.has(rowKey)).map(([, row]) => row.id);
  const added = [...nextByKey.entries()].filter(([rowKey]) => !currentByKey.has(rowKey)).map(([, row]) => row);
  if (removedIds.length) {
    const { error: deleteError } = await supabase.from("note_links").delete().in("id", removedIds);
    if (deleteError) return { ok: false, code: deleteError.code ?? "delete_failed" };
  }
  if (added.length) {
    const { error: insertError } = await supabase.from("note_links").insert(added);
    if (insertError) return { ok: false, code: insertError.code ?? "insert_failed" };
  }
  return { ok: true };
}
