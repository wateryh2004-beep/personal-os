import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/note-editor";
import { getNote } from "@/features/notes/queries";
import { archiveNote, createNoteVersion, restoreNoteVersion, trashNote } from "@/features/notes/actions";

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const data = await getNote(noteId);
  if (!data) notFound();
  return <>
    <Link href="/notes" className="mb-5 inline-block text-sm text-[#365F78]">← 返回笔记库</Link>
    {data.state === "base" ? <p className="mb-5 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">此笔记已保存在 Supabase 数据库中。当前为兼容模式，编辑与 Markdown 下载可用；链接和完整版本功能待 Notes Workspace migration 应用后启用。</p> : null}
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]"><NoteEditor note={data.note} /><aside className="border-l pl-5 text-sm"><h2 className="font-medium">Links</h2><p className="mt-2 text-zinc-500">已解析 {data.links.filter((link) => link.target_note_id).length} · 未解析 {data.links.filter((link) => !link.target_note_id).length}</p><h2 className="mt-7 font-medium">Backlinks</h2><p className="mt-2 text-zinc-500">{data.backlinks.length ? `被 ${data.backlinks.length} 篇笔记引用` : "暂无反向链接"}</p><h2 className="mt-7 font-medium">Versions</h2><form action={createNoteVersion} className="mt-2"><input type="hidden" name="note_id" value={data.note.id} /><button className="border px-2 py-1 text-xs">创建版本</button></form><div className="mt-2 space-y-2 text-zinc-500">{data.versions.map((version) => <form action={restoreNoteVersion} key={version.id} className="flex gap-2"><span>v{version.version_number} · {version.reason}</span><input type="hidden" name="note_id" value={data.note.id} /><input type="hidden" name="version_id" value={version.id} /><button className="text-[#365F78]">恢复</button></form>)}</div><a className="mt-5 block text-[#365F78]" href={`/api/exports/notes/${data.note.id}`}>下载 Markdown</a><form action={archiveNote} className="mt-5"><input type="hidden" name="note_id" value={data.note.id} /><button className="border px-2 py-1 text-xs">归档</button></form><form action={trashNote} className="mt-2"><input type="hidden" name="note_id" value={data.note.id} /><button className="border px-2 py-1 text-xs">移入回收站</button></form></aside></div>
  </>;
}
