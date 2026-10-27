import { NoteSourceExcerptView } from "./note-source-excerpt-view";
import { requireOwner } from "@/lib/auth/require-owner";
import { contentHash } from "@/features/notes/utils";
import type { NoteSourceLocator } from "@/features/links/source-locator";

/** A citation reads the immutable version; it never highlights coincidental current text. */
export async function NoteSourceExcerpt({ locator }: { locator: NoteSourceLocator }) {
  const { supabase, userId } = await requireOwner();
  const [{ data: note }, { data: version }] = await Promise.all([
    supabase.from("notes").select("id,revision").eq("id", locator.noteId).eq("user_id", userId).is("vault_group_id", null).is("archived_at", null).is("deleted_at", null).maybeSingle(),
    supabase.from("note_versions").select("id,note_id,title,body_markdown,revision,created_at").eq("id", locator.versionId).eq("note_id", locator.noteId).eq("user_id", userId).is("archived_at", null).maybeSingle(),
  ]);
  const excerpt = version?.body_markdown.slice(locator.from, locator.to);
  const valid = note && version && version.revision === locator.revision && locator.to <= version.body_markdown.length && excerpt && contentHash(excerpt) === locator.hash;
  return <NoteSourceExcerptView revision={locator.revision} currentRevision={note?.revision??null} excerpt={valid?excerpt:null} />;
}
