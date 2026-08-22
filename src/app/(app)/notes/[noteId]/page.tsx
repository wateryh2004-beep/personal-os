import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NoteBacklinks } from "@/components/notes/note-backlinks";
import { EntityBacklinks } from "@/components/links/entity-backlinks";
import { FolderPicker } from "@/components/notes/folder-picker";
import { getActiveNoteFolders, getNote } from "@/features/notes/queries";
import { getAiSettings } from "@/features/ai/queries";
import { archiveNote, createNoteVersion, moveNote, restoreNoteVersion, setNoteAiVisibility, toggleNotePinned, trashNote } from "@/features/notes/actions";
import { formatNoteTimestamp } from "@/features/notes/utils";
import { Archive, Download, FileClock, FolderInput, History, Link2, Pin, PinOff, Trash2 } from "lucide-react";

function compactDate(value: string | null | undefined) {
  return value ? formatNoteTimestamp(value) : "暂无记录";
}

function noteStats(markdown: string, relationCount: number) {
  const content = markdown.trim();
  return [
    { label: "内容", value: content.length ? `${content.length.toLocaleString("zh-CN")} 字` : "空白" },
    { label: "章节", value: String((content.match(new RegExp("^#{1,6}\\s+", "gm")) ?? []).length) },
    { label: "关联", value: String(relationCount) },
  ];
}

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const data = await getNote(noteId);
  if (!data) notFound();
  const [folders, ai] = await Promise.all([
    getActiveNoteFolders(),
    getAiSettings(),
  ]);
  const stats = noteStats(data.note.body_markdown, data.links.length + data.backlinks.length);
  const inspector = <div className="space-y-5 pb-3 text-sm">
    {data.state === "base" ? <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">当前为兼容模式；链接和完整版本功能待 migration 应用后启用。</p> : null}

    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">文档概览</p><h3 className="mt-1.5 truncate font-semibold text-[var(--text-primary)]">{data.note.title || "无标题笔记"}</h3></div>
          <form action={toggleNotePinned}><input type="hidden" name="note_id" value={data.note.id} /><button className={`flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-colors ${data.note.pinned_at ? "border-[var(--accent)] bg-[var(--surface-selected)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`} aria-label={data.note.pinned_at ? "取消置顶" : "置顶笔记"} title={data.note.pinned_at ? "取消置顶" : "置顶笔记"}>{data.note.pinned_at ? <PinOff className="size-3.5" aria-hidden="true" /> : <Pin className="size-3.5" aria-hidden="true" />}</button></form>
        </div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">最近保存于 {compactDate(data.note.last_saved_at ?? data.note.updated_at)}</p>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-[var(--border)]">
        {stats.map((stat) => <div key={stat.label} className="px-3 py-3"><dt className="text-[11px] text-[var(--text-tertiary)]">{stat.label}</dt><dd className="mt-1 text-sm font-medium text-[var(--text-primary)]">{stat.value}</dd></div>)}
      </dl>
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] p-4">
      <div className="flex items-center gap-2"><FolderInput className="size-4 text-[var(--accent)]" aria-hidden="true" /><h2 className="font-medium text-[var(--text-primary)]">归属位置</h2></div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">为这篇笔记选择一个清晰、稳定的归档位置。</p>
      <form action={moveNote} className="mt-4 grid gap-3">
        <input type="hidden" name="note_id" value={data.note.id} />
        <FolderPicker folders={folders} initialFolderId={data.note.folder_id ?? null} idPrefix={`detail-${data.note.id}`} />
        <button className="justify-self-start rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">更新位置</button>
      </form>
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] p-4">
      <h2 className="font-medium text-[var(--text-primary)]">AI 隐私</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">敏感和“永不使用”笔记不会作为第三方模型的背景上下文。选择后立即生效。</p>
      <form action={setNoteAiVisibility} className="mt-3 flex flex-wrap items-center gap-2"><input type="hidden" name="note_id" value={data.note.id}/><select name="ai_visibility" defaultValue={data.note.ai_visibility ?? "normal"} className="rounded border border-[var(--border)] bg-[var(--surface-canvas)] px-2 py-1.5 text-xs"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：默认不发送</option><option value="never">永不发送给 AI</option></select><button className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]">保存</button></form>
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] p-4">
      <div className="flex items-center gap-2"><Link2 className="size-4 text-[var(--accent)]" aria-hidden="true" /><h2 className="font-medium text-[var(--text-primary)]">关联脉络</h2></div>
      <NoteBacklinks referenced={data.links} backlinks={data.backlinks} />
      <EntityBacklinks type="note" id={data.note.id} />
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] p-4">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="size-4 text-[var(--accent)]" aria-hidden="true" /><h2 className="font-medium text-[var(--text-primary)]">版本快照</h2></div><form action={createNoteVersion}><input type="hidden" name="note_id" value={data.note.id} /><button className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]">创建快照</button></form></div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">创建快照后，随时可回到这一个版本。</p>
      {data.versions.length ? <div className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">{data.versions.slice(0, 5).map((version) => <form action={restoreNoteVersion} key={version.id} className="flex items-center gap-2 py-2.5"><FileClock className="size-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-xs font-medium text-[var(--text-primary)]">版本 {version.version_number} · {version.reason === "manual" ? "手动快照" : version.reason}</span><span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">{compactDate(version.created_at)}</span></span><input type="hidden" name="note_id" value={data.note.id} /><input type="hidden" name="version_id" value={version.id} /><button className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline">恢复</button></form>)}</div> : <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">尚未创建快照。重要修改前可先保存一个版本。</p>}
      {data.versions.length > 5 ? <p className="mt-2 text-xs text-[var(--text-tertiary)]">仅展示最近 5 个版本。</p> : null}
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] p-4">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">文档操作</h2>
      <a className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]" href={`/api/exports/notes/${data.note.id}`}><Download className="size-4 text-[var(--accent)]" aria-hidden="true" />下载 Markdown</a>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3"><form action={archiveNote}><input type="hidden" name="note_id" value={data.note.id} /><button className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Archive className="size-3.5" aria-hidden="true" />归档</button></form><form action={trashNote}><input type="hidden" name="note_id" value={data.note.id} /><button className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-red-200 px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" aria-hidden="true" />移入回收站</button></form></div>
      <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">创建于 {compactDate(data.note.created_at)} · 修订 {data.note.revision}</p>
    </section>
  </div>;
  return <NoteDocumentShell noteId={data.note.id} editor={<NoteEditor note={data.note} noteAiDefaultModel={ai.settings?.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash"} />} inspector={inspector} />;
}
