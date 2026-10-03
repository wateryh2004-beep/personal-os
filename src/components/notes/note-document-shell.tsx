"use client";

import { Inspector } from "@/components/shared/inspector";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { publishNotesNavigatorTitle } from "@/features/notes/navigator-title-sync";
import { lastNotesListSessionKey, notesListHref } from "@/features/notes/navigation";
import { loadWorkspaceSession } from "@/lib/workspace-session";
import { useRouter } from "next/navigation";
import { ChevronLeft, PanelRight, ExternalLink, Download } from "lucide-react";
import { useState } from "react";
import { noteAttachmentUrl, notePdfAttachments, type NoteAttachment } from "@/features/notes/attachments";

export function NoteDocumentShell({ noteId, editor, inspector, attachments = [] }: {
  noteId: string; editor: React.ReactNode; inspector: React.ReactNode; attachments?: NoteAttachment[];
}) {
  const pdfs = notePdfAttachments(attachments);
  const [view, setView] = useState<"markdown" | "pdf">(pdfs[0]?.role === "primary_pdf" ? "pdf" : "markdown");
  const [pdfId, setPdfId] = useState(pdfs[0]?.id ?? "");
  const selectedPdf = pdfs.find((file) => file.id === pdfId) ?? pdfs[0];
  const noteInspector = useWorkspacePanel(`note-inspector:${noteId}`);
  const router = useRouter();

  const handleEditorInput = (event: React.FormEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("aria-label") !== "笔记标题") return;
    publishNotesNavigatorTitle(noteId, target.value);
  };

  const returnToNotesList = () => {
    const session = loadWorkspaceSession<{ href?: string }>(lastNotesListSessionKey);
    router.replace(notesListHref(session));
  };

  return (
    <section
      onInputCapture={handleEditorInput}
      className="notes-document-shell relative flex h-full min-h-0 overflow-hidden bg-[var(--surface-canvas)]"
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between px-2.5">
          <button
            type="button"
            onClick={returnToNotesList}
            className="pressable pointer-events-auto inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:hidden"
            aria-label="返回笔记列表"
          >
            <ChevronLeft className="size-[18px]" aria-hidden="true" />
          </button>
          <span className="hidden md:block" />
          <button
            type="button"
            onClick={noteInspector.toggle}
            aria-pressed={noteInspector.isOpen}
            aria-label={noteInspector.isOpen ? "关闭笔记详情" : "打开笔记详情"}
            className={`pressable pointer-events-auto inline-flex size-11 items-center justify-center rounded-full ${noteInspector.isOpen ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
          >
            <PanelRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        {pdfs.length > 0 ? <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--separator)] pl-12 pr-14 md:pl-6" role="group" aria-label="文档阅读方式">
          <button type="button" aria-pressed={view === "markdown"} onClick={() => setView("markdown")} className={`pressable rounded-[8px] px-3 py-1.5 text-[12px] ${view === "markdown" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>正文</button>
          <button type="button" aria-pressed={view === "pdf"} onClick={() => setView("pdf")} className={`pressable rounded-[8px] px-3 py-1.5 text-[12px] ${view === "pdf" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>PDF</button>
          <span className="ml-2 hidden truncate text-[11px] text-[var(--text-tertiary)] sm:block">{selectedPdf?.role === "pdf_snapshot" ? "飞书导入时的原始排版" : selectedPdf?.title}</span>
        </div> : null}
        {/* Keep the editor mounted so drafts and in-flight autosaves survive view changes. */}
        <div className="min-h-0 flex-1" hidden={view === "pdf" && !!selectedPdf}>{editor}</div>
        {view === "pdf" && selectedPdf ? <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--separator)] px-3 py-2 text-[12px]">
            {pdfs.length > 1 ? <select aria-label="选择 PDF" value={selectedPdf.id} onChange={(event) => setPdfId(event.target.value)} className="min-w-0 max-w-full flex-1 rounded-[8px] bg-[var(--surface-control)] px-2 py-1.5 text-[var(--text-primary)]">{pdfs.map((pdf) => <option key={pdf.id} value={pdf.id}>{pdf.title}</option>)}</select> : <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{selectedPdf.original_filename}</span>}
            <a href={noteAttachmentUrl(selectedPdf.id, true)} target="_blank" rel="noopener noreferrer" className="pressable inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"><ExternalLink className="size-3.5" aria-hidden="true" />独立窗口</a>
            <a href={noteAttachmentUrl(selectedPdf.id)} className="pressable inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"><Download className="size-3.5" aria-hidden="true" />下载</a>
          </div>
          <iframe key={selectedPdf.id} src={`${noteAttachmentUrl(selectedPdf.id, true)}#view=FitH`} title={`PDF 阅读器：${selectedPdf.title}`} className="min-h-0 w-full flex-1 border-0 bg-[var(--surface-hover)]" />
          <p className="shrink-0 px-3 py-1.5 text-[10.5px] text-[var(--text-tertiary)]">若浏览器无法显示 PDF，可在独立窗口阅读或下载。PDF 原件不会随正文编辑而改变。</p>
        </div> : null}
      </div>
      <Inspector
        open={noteInspector.isOpen}
        title="笔记详情"
        onClose={noteInspector.close}
        className="notes-inspector"
      >
        {inspector}
      </Inspector>
    </section>
  );
}
