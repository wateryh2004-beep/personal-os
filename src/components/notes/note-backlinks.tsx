import Link from "next/link";

type LinkedNote = { id: string; title: string };

function RelationList({ label, notes, empty }: { label: string; notes: readonly LinkedNote[]; empty: string }) {
  const visible = notes.slice(0, 6);
  const remaining = notes.slice(6);
  return <section className="mt-5">
    <h2 className="text-[10.5px] font-semibold tracking-[.04em] text-[var(--text-tertiary)]">{label}</h2>
    {notes.length ? <div className="mt-1.5 space-y-1 text-[12px]">
      {visible.map((note) => <Link key={note.id} href={`/notes/${note.id}`} className="block truncate rounded-[6px] py-0.5 text-[var(--accent)] hover:underline" title={note.title}>{note.title}</Link>)}
      {remaining.length ? <details className="pt-1 text-[10.5px]"><summary className="pressable inline-flex cursor-pointer list-none rounded-[6px] px-1 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">查看其余 {remaining.length} 篇</summary><div className="mt-2 space-y-1.5">{remaining.map((note) => <Link key={note.id} href={`/notes/${note.id}`} className="block truncate text-[var(--accent)] hover:underline" title={note.title}>{note.title}</Link>)}</div></details> : null}
    </div> : <p className="mt-1.5 text-[10.5px] text-[var(--text-tertiary)]">{empty}</p>}
  </section>;
}

export function NoteBacklinks({ referenced, backlinks }: { referenced: readonly LinkedNote[]; backlinks: readonly LinkedNote[] }) {
  return <>
    <RelationList label="本文引用" notes={referenced} empty="尚未引用其他笔记" />
    <RelationList label="引用本文" notes={backlinks} empty="暂无笔记引用本文" />
  </>;
}
