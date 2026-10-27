import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { contentHash } from "./utils";
import {
  dailyNoteTemplate,
  dateInTimeZone,
} from "./daily-note-utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function audit(
  supabase: Supabase,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  afterData: Record<string, unknown>,
) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_type: "user",
    after_data: afterData,
  });
  if (error) throw new Error("daily_note_audit_failed");
}

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
  const hash = contentHash(bodyMarkdown);
  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,
      folder_id: monthFolderId,
      title,
      body_markdown: bodyMarkdown,
      status: "active",
      revision: 1,
      content_hash: hash,
      word_count: bodyMarkdown.trim().split(/\s+/).length,
      character_count: bodyMarkdown.length,
      last_saved_at: new Date().toISOString(),
    })
    .select("id,title,body_markdown,revision")
    .single();
  if (error || !note) throw new Error("daily_note_create_failed");
  const version = await supabase.from("note_versions").insert({
    user_id: userId,
    note_id: note.id,
    title,
    body_markdown: bodyMarkdown,
    version_number: 1,
    created_by: userId,
    content_hash: hash,
    revision: 1,
    reason: "initial",
  });
  if (version.error) throw new Error("daily_note_version_failed");
  await audit(supabase, userId, "create_daily_note", "note", note.id, {
    date,
    folder: `日记/${year}/${month}`,
  });
  return { ...note, date, created: true };
}
