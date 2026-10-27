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
  return <aside aria-label="引用的历史原文" className="relative z-10 max-h-[40vh] shrink-0 overflow-auto border-b border-[var(--separator)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
    {valid ? <><p className="mb-2 text-xs text-[var(--text-secondary)]">引用时的原文 · 版本 {locator.revision}{note.revision !== locator.revision ? " · 当前笔记已有更新" : ""}</p><blockquote className="whitespace-pre-wrap break-words border-l-2 border-[var(--accent)] pl-3">{excerpt}</blockquote></> : <p role="status">这段历史原文暂不可用。不会在当前正文中猜测定位。</p>}
  </aside>;
}
