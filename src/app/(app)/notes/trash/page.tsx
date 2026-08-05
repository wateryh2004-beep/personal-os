import Link from "next/link";
import { restoreNote } from "@/features/notes/actions";
import { getTrashedNotes } from "@/features/notes/queries";
export default async function NotesTrash() { const notes = await getTrashedNotes(); return <section><Link href="/notes" className="text-sm text-[#365F78]">← Notes</Link><h1 className="mt-5 text-2xl font-semibold">回收站</h1><p className="mt-1 text-sm text-zinc-500">笔记默认保留 30 天；永久删除需在后续版本单独确认。</p><div className="mt-6 divide-y border-y">{notes.map((note) => <div key={note.id} className="flex justify-between py-3"><span>{note.title || "无标题笔记"}</span><form action={restoreNote}><input type="hidden" name="note_id" value={note.id} /><button className="border px-2 py-1 text-sm">恢复</button></form></div>)}</div></section>; }
