import Link from "next/link";
import { CopyNoteReference } from "@/components/notes/copy-note-reference";
import { relatedWorkFromNote } from "@/features/notes/links/reference";

type LinkedNote = { id: string; title: string };
type Relation = LinkedNote & { href: string; source: string };

function RelationRow({ relation }: { relation: Relation }) {
  return <div className="flex min-w-0 items-center gap-1 rounded-[6px]">
    <Link href={relation.href} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[var(--accent)] hover:underline" title={`${relation.source} · ${relation.title}`}>
      <span className="shrink-0 rounded bg-[var(--surface-hover)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">{relation.source}</span>
      <span className="truncate">{relation.title}</span>
    </Link>
    <CopyNoteReference title={relation.title} href={relation.href} />
  </div>;
}

function RelationList({ label, relations, empty }: { label: string; relations: readonly Relation[]; empty: string }) {
  const visible = relations.slice(0, 6);
  const remaining = relations.slice(6);
  return <section className="mt-5">
    <h2 className="text-[10.5px] font-semibold tracking-[.04em] text-[var(--text-tertiary)]">{label}{relations.length ? ` · ${relations.length}` : ""}</h2>
    {relations.length ? <div className="mt-1.5 space-y-1 text-[12px]">
      {visible.map((relation) => <RelationRow key={relation.id} relation={relation} />)}
      {remaining.length ? <details className="pt-1"><summary className="pressable inline-flex cursor-pointer list-none rounded-[6px] px-1 py-0.5 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">查看其余 {remaining.length} 项</summary><div className="mt-2 space-y-1.5">{remaining.map((relation) => <RelationRow key={relation.id} relation={relation} />)}</div></details> : null}
    </div> : <p className="mt-1.5 text-[10.5px] text-[var(--text-tertiary)]">{empty}</p>}
  </section>;
}

export function NoteBacklinks({ referenced, backlinks, bodyMarkdown = "" }: { referenced: readonly LinkedNote[]; backlinks: readonly LinkedNote[]; bodyMarkdown?: string }) {
  const asRelation = (note: LinkedNote): Relation => ({ ...note, href: `/notes/${note.id}`, source: "笔记" });
  return <>
    <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">打开关联内容，或复制引用复用到笔记、任务和日程。输入 [[ 引用笔记，输入 @ 查找相关工作。</p>
    <RelationList label="本文引用" relations={referenced.map(asRelation)} empty="尚未引用其他笔记" />
    <RelationList label="关联工作（已保存正文）" relations={relatedWorkFromNote(bodyMarkdown)} empty="尚未引用任务、日程或文件" />
    <RelationList label="引用本文" relations={backlinks.map(asRelation)} empty="暂无笔记引用本文" />
  </>;
}
