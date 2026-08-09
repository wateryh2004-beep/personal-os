"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Download, Maximize2, Minimize2, MoreHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { recordNotePdfExport, saveNote } from "@/features/notes/actions";
import { markdownFilename } from "@/features/notes/utils";
import { NoteAiAssistant, type NoteSelection } from "@/components/notes/note-ai-assistant";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import { loadWorkspaceSession, removeWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { lastOpenedNoteSessionKey, lastOpenedNoteTtlMs } from "@/features/notes/navigation";

const VisualMarkdownEditor = dynamic(() => import("@/components/notes/visual-markdown-editor").then((module) => module.VisualMarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-80 bg-white p-6 text-sm text-zinc-500">正在载入 Markdown 编辑器…</div>,
});

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null };
type PdfSnapshot = { title: string; body: string };
type NoteDraftSession = { title: string; body: string; baseRevision: number };

const pdfCloneStyles = `
  #note-pdf-preview, #note-pdf-preview * { color: #27272a !important; border-color: #e7e5e4 !important; }
  #note-pdf-preview { position: absolute !important; left: 0 !important; top: 0 !important; z-index: 1 !important; width: 794px !important; min-height: 1px !important; background: #ffffff !important; }
  #note-pdf-preview h1, #note-pdf-preview h2, #note-pdf-preview h3 { color: #18181b !important; }
  #note-pdf-preview pre { background: #18181b !important; color: #f4f4f5 !important; }
  #note-pdf-preview pre * { color: #f4f4f5 !important; }
  #note-pdf-preview code { background: #f4f4f5 !important; }
  #note-pdf-preview pre code { background: transparent !important; }
  #note-pdf-preview th { background: #f4f4f5 !important; }
`;

function MarkdownDocument({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    h1: ({ children }) => <h1 className="mb-5 mt-1 text-3xl font-semibold tracking-tight text-zinc-900">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-8 border-b pb-2 text-xl font-semibold text-zinc-900">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold text-zinc-900">{children}</h3>,
    p: ({ children }) => <p className="mb-4 leading-7 text-zinc-700">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6 text-zinc-700">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-zinc-700">{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => <blockquote className="mb-4 border-l-2 border-[#365F78] pl-4 italic text-zinc-600">{children}</blockquote>,
    pre: ({ children }) => <pre className="mb-4 overflow-x-auto bg-zinc-950 p-4 text-sm leading-6 text-zinc-100">{children}</pre>,
    code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800">{children}</code>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#365F78] underline underline-offset-2">{children}</a>,
    table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border bg-zinc-50 px-3 py-2 font-medium">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
    hr: () => <hr className="my-7 border-zinc-200" />,
  }}>{body}</ReactMarkdown>;
}

export function NoteEditor({ note, noteAiDefaultModel }: { note: Note; noteAiDefaultModel: DeepSeekModelId }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [state, setState] = useState<"已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突">("已保存");
  const [pdfSnapshot, setPdfSnapshot] = useState<PdfSnapshot | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [selection, setSelection] = useState<NoteSelection | null>(null);
  const pdfPreviewRef = useRef<HTMLElement>(null);
  const editorSurfaceRef = useRef<HTMLElement>(null);
  const latestContentRef = useRef({ title: note.title, body: note.body_markdown });
  const revisionRef = useRef(note.revision);
  const saveInFlightRef = useRef(false);
  const noteSessionKey = `notes:draft:${note.id}`;
  const saveDraft = useCallback((nextTitle: string, nextBody: string, baseRevision = revisionRef.current) => {
    saveWorkspaceSession<NoteDraftSession>(noteSessionKey, { title: nextTitle, body: nextBody, baseRevision });
  }, [noteSessionKey]);

  useEffect(() => {
    saveWorkspaceSession(lastOpenedNoteSessionKey, { noteId: note.id }, lastOpenedNoteTtlMs);
  }, [note.id]);

  useEffect(() => {
    const draft = loadWorkspaceSession<NoteDraftSession>(noteSessionKey);
    if (!draft || (draft.title === note.title && draft.body === note.body_markdown)) return;
    const timer = window.setTimeout(() => {
      latestContentRef.current = { title: draft.title, body: draft.body };
      setTitle(draft.title);
      setBody(draft.body);
      setState("有未保存修改");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [note.body_markdown, note.title, noteSessionKey]);

  const save = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    const snapshot = latestContentRef.current;
    const expectedRevision = revisionRef.current;
    setState("正在保存");
    try {
      const result = await saveNote({ noteId: note.id, expectedRevision, title: snapshot.title, bodyMarkdown: snapshot.body });
      if (result.status === "conflict") { setState("版本冲突"); return; }
      revisionRef.current = result.revision;
      const latest = latestContentRef.current;
      if (latest.title === snapshot.title && latest.body === snapshot.body) {
        setState("已保存");
        removeWorkspaceSession(noteSessionKey);
      } else {
        setState("有未保存修改");
        saveDraft(latest.title, latest.body, result.revision);
      }
    } catch {
      const latest = latestContentRef.current;
      setState("保存失败");
      saveDraft(latest.title, latest.body);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [note.id, noteSessionKey, saveDraft]);

  useEffect(() => { if (state !== "有未保存修改") return; const timer = window.setTimeout(() => void save(), 1000); return () => window.clearTimeout(timer); }, [save, state]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [save]);
  useEffect(() => { const update = () => setIsFullscreen(document.fullscreenElement === editorSurfaceRef.current); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);
  useEffect(() => {
    if (!pdfSnapshot || !pdfPreviewRef.current) return;
    let cancelled = false;
    const exportPdf = async () => {
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const element = pdfPreviewRef.current;
        if (!element || cancelled) return;
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        const canvas = await html2canvas(element, {
          backgroundColor: "#ffffff",
          scale: 1.5,
          width: element.scrollWidth,
          height: element.scrollHeight,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          onclone: (document) => {
            const style = document.createElement("style");
            style.textContent = pdfCloneStyles;
            document.head.append(style);
          },
        });
        if (cancelled) return;
        if (!canvas.width || !canvas.height) throw new Error("empty_pdf_canvas");
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const margin = 40;
        const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
        const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;
        const scale = printableWidth / canvas.width;
        const sourcePageHeight = Math.floor(printableHeight / scale);
        let sourceY = 0;
        let page = 0;
        while (sourceY < canvas.height) {
          const sourceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sourceHeight;
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error("canvas_unavailable");
          context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
          if (page) pdf.addPage();
          pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, printableWidth, sourceHeight * scale, undefined, "FAST");
          sourceY += sourceHeight;
          page += 1;
        }
        pdf.save(markdownFilename(pdfSnapshot.title).replace(/\.md$/i, ".pdf"));
        // A successful local download must not be reported as failed only because
        // the non-essential audit write is temporarily unavailable.
        await recordNotePdfExport(note.id).catch(() => undefined);
      } catch {
        if (!cancelled) setPdfError("PDF 暂时无法生成，请刷新后重试。");
      } finally {
        if (!cancelled) setPdfSnapshot(null);
      }
    };
    void exportPdf();
    return () => { cancelled = true; };
  }, [note.id, pdfSnapshot]);

  const dirty = useCallback((nextTitle: string, nextBody: string) => {
    latestContentRef.current = { title: nextTitle, body: nextBody };
    setState("有未保存修改");
    saveDraft(nextTitle, nextBody);
  }, [saveDraft]);
  const handleBodyChange = useCallback((value: string) => {
    setBody(value);
    dirty(title, value);
  }, [dirty, title]);
  const isExporting = Boolean(pdfSnapshot);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await editorSurfaceRef.current?.requestFullscreen();
    } catch { setPdfError("浏览器未能进入全屏模式，请检查浏览器权限后重试。"); }
  };
  return <section ref={editorSurfaceRef} className="notes-editor-surface flex h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)]"><div className="flex min-w-0 flex-1 flex-col"><div className="flex min-h-[var(--toolbar-height)] shrink-0 items-center gap-3 border-b px-4 sm:px-6"><input aria-label="笔记标题" value={title} onChange={(event) => { const nextTitle = event.target.value; setTitle(nextTitle); dirty(nextTitle, body); }} className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-[-0.01em] outline-none placeholder:text-[var(--text-tertiary)]" placeholder="无标题笔记" /><span aria-live="polite" className={`shrink-0 text-xs ${state === "保存失败" || state === "版本冲突" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>{state === "正在保存" ? "正在保存…" : state}</span><Button variant="ghost" size="sm" onClick={() => setAiOpen((value) => !value)} aria-pressed={aiOpen}><Sparkles aria-hidden="true" />AI</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="笔记更多操作"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void save()}>立即保存 <span className="ml-auto text-xs text-[var(--text-tertiary)]">⌘S</span></DropdownMenuItem><DropdownMenuItem onSelect={() => void toggleFullscreen()}>{isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{isFullscreen ? "退出全屏" : "全屏编辑"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={isExporting} onSelect={() => { setPdfError(""); setPdfSnapshot({ title: title || "无标题笔记", body }); }}><Download aria-hidden="true" />{isExporting ? "正在生成 PDF…" : "导出 PDF"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>{pdfError ? <p role="alert" className="px-6 py-2 text-sm text-[var(--danger)]">{pdfError}</p> : null}{imageUploadMessage ? <p role="status" aria-live="polite" className={`px-6 py-2 text-sm ${imageUploadMessage.includes("失败") || imageUploadMessage.includes("不支持") ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{imageUploadMessage}</p> : null}<div className="workspace-scroll min-h-0 flex-1 overflow-y-auto bg-white"><VisualMarkdownEditor markdown={body} noteId={note.id} onImageUploadStatus={setImageUploadMessage} onOpenAi={() => setAiOpen(true)} onSelectionChange={setSelection} onChange={handleBodyChange} /></div></div><NoteAiAssistant open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} noteId={note.id} title={title} bodyMarkdown={body} defaultModel={noteAiDefaultModel} selection={selection} onReplaceNote={(suggestion) => { setBody(suggestion); dirty(title, suggestion); }} onInsertNote={(suggestion) => { const nextBody = `${body}${body.trim() ? "\n\n" : ""}${suggestion}`; setBody(nextBody); dirty(title, nextBody); }} />{pdfSnapshot ? <article id="note-pdf-preview" ref={pdfPreviewRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-12 text-[15px]"><h1 className="mb-7 text-3xl font-semibold text-zinc-900">{pdfSnapshot.title}</h1><MarkdownDocument body={pdfSnapshot.body} /></article> : null}</section>;
}
