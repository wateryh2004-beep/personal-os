import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { NoteReader } from "@/components/notes/note-reader";

export default async function NoteReadingPage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  if (!z.string().uuid().safeParse(noteId).success) notFound();
  const { supabase, userId } = await requireOwner();
  const { data: note, error } = await supabase.from("notes")
    .select("id,title,body_markdown,revision").eq("id", noteId).eq("user_id", userId)
    .eq("status", "active").is("archived_at", null).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("笔记暂时无法读取，请稍后重试。");
  if (!note) notFound();
  const [sources, versions] = await Promise.all([
    supabase.from("audit_logs").select("after_data,created_at").eq("user_id", userId).eq("entity_id", noteId)
      .eq("action", "content.write").order("created_at", { ascending: false }).limit(10),
    supabase.from("note_versions").select("id,title,body_markdown,version_number").eq("user_id", userId).eq("note_id", noteId)
      .is("archived_at", null).order("version_number", { ascending: false }).limit(10),
  ]);
  return <NoteReader note={{ id: note.id, title: note.title, bodyMarkdown: note.body_markdown, revision: note.revision, historyUnavailable: Boolean(sources.error || versions.error),
    sources: (sources.data ?? []).map((row) => ({ source: typeof row.after_data?.source === "string" ? row.after_data.source : "外部内容", sourceUrl: typeof row.after_data?.sourceUrl === "string" ? row.after_data.sourceUrl : null, captureMode: row.after_data?.captureMode === "original" || row.after_data?.captureMode === "curated" ? row.after_data.captureMode : null, savedAt: row.created_at })),
    versions: (versions.data ?? []).map((row) => ({ id: row.id, title: row.title, bodyMarkdown: row.body_markdown, versionNumber: row.version_number })),
  }} />;
}
