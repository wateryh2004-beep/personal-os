import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { mutateNoteAtomic } from "./atomic";
import {
  appendInboxEntryToDailyNote,
  dailyNoteTemplate,
  dateInTimeZone,
  inboxSourceMarker,
} from "./daily-note-utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function getOrCreateJournalFolder(
  supabase: Supabase,
  userId: string,
  name: string,
  parentId: string | null,
) {
  const existingQuery = supabase
    .from("note_folders")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .is("archived_at", null);
  const existing = await (parentId
    ? existingQuery.eq("parent_id", parentId)
    : existingQuery.is("parent_id", null))
    .order("created_at")
    .limit(1);
  if (existing.data?.[0]) return existing.data[0].id;
  if (existing.error) throw new Error("journal_folder_lookup_failed");

  const inserted = await supabase
    .from("note_folders")
    .insert({ user_id: userId, name, parent_id: parentId })
    .select("id")
    .single();
  if (inserted.data) return inserted.data.id;

  // The partial unique index protects concurrent daily-note requests.
  const concurrentQuery = supabase
    .from("note_folders")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .is("archived_at", null);
  const concurrent = await (parentId
    ? concurrentQuery.eq("parent_id", parentId)
    : concurrentQuery.is("parent_id", null))
    .order("created_at")
    .limit(1);
  if (!concurrent.data?.[0]) throw new Error("journal_folder_create_failed");
  return concurrent.data[0].id;
}

export async function getOrCreateDailyNote(
  supabase: Supabase,
  userId: string,
  timeZone: string,
  now = new Date(),
) {
  const date = dateInTimeZone(now, timeZone);
  const title = `日记 · ${date}`;
  const [year, month] = date.split("-");
  const journalFolderId = await getOrCreateJournalFolder(
    supabase,
    userId,
    "日记",
    null,
  );
  const yearFolderId = await getOrCreateJournalFolder(
    supabase,
    userId,
    year,
    journalFolderId,
  );
  const monthFolderId = await getOrCreateJournalFolder(
    supabase,
    userId,
    month,
    yearFolderId,
  );
  const { data: existing, error: findError } = await supabase
    .from("notes")
    .select("id,title,body_markdown,revision")
    .eq("user_id", userId)
    .eq("title", title)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error("daily_note_lookup_failed");

  if (existing) {
    const { data: organized, error } = await supabase
      .from("notes")
      .update({
        folder_id: monthFolderId,
        status: "active",
        archived_at: null,
      })
      .eq("user_id", userId)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (error || !organized) throw new Error("daily_note_organize_failed");
    return { ...existing, date, created: false };
  }

  const bodyMarkdown = dailyNoteTemplate(date);
  const created = await mutateNoteAtomic(supabase, { operation: "create", title, body: bodyMarkdown, folderId: monthFolderId, reason: "initial" });
  return { id: created.id, title, body_markdown: bodyMarkdown, revision: created.revision, date, created: true };

}

export async function appendInboxToDailyNote(
  supabase: Supabase,
  userId: string,
  timeZone: string,
  inboxId: string,
  content: string,
) {
  const daily = await getOrCreateDailyNote(
    supabase,
    userId,
    timeZone,
  );
  const marker = inboxSourceMarker(inboxId);
  if (!daily.body_markdown.includes(marker)) {
    const bodyMarkdown = appendInboxEntryToDailyNote(
      daily.body_markdown,
      inboxId,
      content,
    );
    try {
      await mutateNoteAtomic(supabase, { operation: "update", noteId: daily.id, expectedRevision: daily.revision, body: bodyMarkdown, reason: "inbox_append" });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "note_revision_conflict") throw error;
      const { data: concurrent } = await supabase.from("notes").select("body_markdown").eq("user_id", userId).eq("id", daily.id).maybeSingle();
      if (!concurrent?.body_markdown.includes(marker)) throw new Error("daily_note_conflict");
    }
  }

  return { noteId: daily.id, date: daily.date };
}
