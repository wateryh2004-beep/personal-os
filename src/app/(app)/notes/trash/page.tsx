
import { restoreNote } from "@/features/notes/actions";
import { getTrashedNotes } from "@/features/notes/queries";

export default async function NotesTrash() {
  const notes = await getTrashedNotes();
  return (
    <section className="workspace-scroll h-full overflow-y-auto px-4 pb-6 pt-14 sm:px-7 md:pt-[30px] lg:px-10">
      <div className="mx-auto max-w-[748px]">
        <h1 className="text-[27px] font-semibold leading-[1.08] tracking-[-0.042em] text-[var(--text-primary)]">回收站</h1>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">已移入回收站的笔记可在这里恢复。</p>
        <div className="mt-5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
          {notes.map((note) => (
            <div key={note.id} className="flex min-h-12 items-center justify-between gap-4 px-2 py-2.5">
              <span className="truncate text-[13.5px] text-[var(--text-primary)]">{note.title || "无标题笔记"}</span>
              <form action={restoreNote}>
                <input type="hidden" name="note_id" value={note.id} />
                <button className="pressable h-8 rounded-[8px] px-2 text-[11.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">恢复</button>
              </form>
            </div>
          ))}
          {notes.length === 0 ? <p className="py-12 text-center text-[12.5px] text-[var(--text-tertiary)]">回收站为空。</p> : null}
        </div>
      </div>
    </section>
  );
}
