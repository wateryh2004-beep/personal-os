"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  Copy,
  Download,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Save as SaveIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { recordNotePdfExport, saveNote } from "@/features/notes/actions";
import { markdownFilename } from "@/features/notes/utils";
import type { NoteLinkSuggestion } from "@/features/notes/links/types";
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import { loadWorkspaceSession, removeWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { lastOpenedNoteSessionKey, lastOpenedNoteTtlMs } from "@/features/notes/navigation";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { perfMark } from "@/lib/perf";
import {
  noteAutosaveDebounceMs,
  noteAutosaveMaxWaitMs,
  noteDraftRecoveryTtlMs,
} from "@/features/notes/editor/save-policy";

const VisualMarkdownEditor = dynamic(() => import("@/components/notes/visual-markdown-editor").then((module) => module.VisualMarkdownEditor), {
  ssr: false,
  loading: () => <div className="notes-editor-loading" aria-label="正在载入 Markdown 编辑器" aria-busy="true" />,
});
const NoteAiAssistant = dynamic(() => import("@/components/notes/note-ai-assistant").then((module) => module.NoteAiAssistant), { ssr: false });

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null };
type PdfSnapshot = { title: string; body: string };
type NoteDraftSession = { title: string; body: string; baseRevision: number };
type SaveState = "已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突";

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
  return <div className="markdown-document"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    h1: ({ children }) => <h1 className="mb-5 mt-1 text-3xl font-semibold tracking-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-8 border-b pb-2 text-xl font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold">{children}</h3>,
    p: ({ children }) => <p className="mb-4 leading-7">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => <blockquote className="mb-4 border-l-2 pl-4 italic">{children}</blockquote>,
    pre: ({ children }) => <pre className="mb-4 overflow-x-auto bg-zinc-950 p-4 text-sm leading-6 text-zinc-100">{children}</pre>,
    code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>,
    table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border px-3 py-2 font-medium">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
    hr: () => <hr className="my-7" />,
  }}>{body}</ReactMarkdown></div>;
}

function savedTimeLabel(value: string | null) {
  if (!value) return "已保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已保存";
  return `已保存 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)}`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy_failed");
}

export function NoteEditor({ note, noteAiDefaultModel, recentNoteLinks = [] }: { note: Note; noteAiDefaultModel: DeepSeekModelId; recentNoteLinks?: readonly NoteLinkSuggestion[] }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [state, setState] = useState<SaveState>("已保存");
  const [lastSavedAt, setLastSavedAt] = useState(note.last_saved_at);
  const [editVersion, setEditVersion] = useState(0);
  const [pdfSnapshot, setPdfSnapshot] = useState<PdfSnapshot | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const noteAiPanel = useWorkspacePanel(`note-ai:${note.id}`);
  const [selection, setSelection] = useState<NoteSelection | null>(null);
  const pdfPreviewRef = useRef<HTMLElement>(null);
  const editorSurfaceRef = useRef<HTMLElement>(null);
  const latestContentRef = useRef({ title: note.title, body: note.body_markdown });
  const revisionRef = useRef(note.revision);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveQueuedRef = useRef(false);
  const isDirtyRef = useRef(false);
  const noteSessionKey = `notes:draft:${note.id}`;
  const saveDraft = useCallback((nextTitle: string, nextBody: string, baseRevision = revisionRef.current) => {
    saveWorkspaceSession<NoteDraftSession>(
      noteSessionKey,
      { title: nextTitle, body: nextBody, baseRevision },
      noteDraftRecoveryTtlMs,
    );
  }, [noteSessionKey]);
  const rememberOpenNote = useCallback(() => {
    saveWorkspaceSession(lastOpenedNoteSessionKey, { noteId: note.id }, lastOpenedNoteTtlMs);
  }, [note.id]);

  useEffect(() => {
    rememberOpenNote();
  }, [rememberOpenNote]);

  useEffect(() => {
    const draft = loadWorkspaceSession<NoteDraftSession>(noteSessionKey);
    if (!draft || (draft.title === note.title && draft.body === note.body_markdown)) return;
    const timer = window.setTimeout(() => {
      latestContentRef.current = { title: draft.title, body: draft.body };
      if (Number.isInteger(draft.baseRevision) && draft.baseRevision >= 0) {
        revisionRef.current = draft.baseRevision;
      }
      setTitle(draft.title);
      setBody(draft.body);
      isDirtyRef.current = true;
      setState("有未保存修改");
      setEditVersion((version) => version + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [note.body_markdown, note.title, noteSessionKey]);

  const save = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return saveInFlightRef.current;
    }
    if (!isDirtyRef.current) return;

    const operation = (async () => {
      do {
        saveQueuedRef.current = false;
        const snapshot = latestContentRef.current;
        const expectedRevision = revisionRef.current;
        perfMark("note-autosave-start", { noteId: note.id, expectedRevision });
        setState("正在保存");
        try {
          const result = await saveNote({
            noteId: note.id,
            expectedRevision,
            title: snapshot.title,
            bodyMarkdown: snapshot.body,
          });
          if (result.status === "conflict") {
            isDirtyRef.current = true;
            setState("版本冲突");
            return;
          }
          revisionRef.current = result.revision;
          setLastSavedAt(result.lastSavedAt);
          perfMark("note-autosave-end", { noteId: note.id, revision: result.revision });
          const latest = latestContentRef.current;
          if (latest.title === snapshot.title && latest.body === snapshot.body) {
            isDirtyRef.current = false;
            setState("已保存");
            removeWorkspaceSession(noteSessionKey);
          } else {
            isDirtyRef.current = true;
            setState("有未保存修改");
            saveDraft(latest.title, latest.body, result.revision);
          }
        } catch {
          perfMark("note-autosave-failed", { noteId: note.id });
          const latest = latestContentRef.current;
          isDirtyRef.current = true;
          setState("保存失败");
          saveDraft(latest.title, latest.body);
          return;
        }
      } while (saveQueuedRef.current && isDirtyRef.current);
    })();

    saveInFlightRef.current = operation;
    try {
      await operation;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [note.id, noteSessionKey, saveDraft]);

  useEffect(() => {
    if (!editVersion) return;
    const timer = window.setTimeout(() => void save(), noteAutosaveDebounceMs);
    return () => window.clearTimeout(timer);
  }, [editVersion, save]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isDirtyRef.current) void save();
    }, noteAutosaveMaxWaitMs);
    return () => window.clearInterval(timer);
  }, [save]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [save]);
  useEffect(() => {
    const flush = () => {
      if (isDirtyRef.current) void save();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warnBeforeUnload);
      flush();
    };
  }, [save]);
  useEffect(() => { const update = () => setIsFullscreen(document.fullscreenElement === editorSurfaceRef.current); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);
  useEffect(() => {
    if (!isFallbackFullscreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFallbackFullscreen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [isFallbackFullscreen]);
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
    isDirtyRef.current = true;
    setState("有未保存修改");
    setEditVersion((version) => version + 1);
    saveDraft(nextTitle, nextBody);
    rememberOpenNote();
  }, [rememberOpenNote, saveDraft]);
  const handleBodyChange = useCallback((value: string) => {
    setBody(value);
    dirty(title, value);
  }, [dirty, title]);
  const isExporting = Boolean(pdfSnapshot);
  const fullscreenActive = isFullscreen || isFallbackFullscreen;
  const statusLabel = state === "已保存" ? savedTimeLabel(lastSavedAt) : state;
  const saveHasError = state === "保存失败" || state === "版本冲突";
  const toggleFullscreen = async () => {
    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const surface = editorSurfaceRef.current;
    if (!surface?.requestFullscreen) {
      setIsFallbackFullscreen(true);
      return;
    }
    try {
      await surface.requestFullscreen();
    } catch {
      setIsFallbackFullscreen(true);
    }
  };
  const copyFullNote = async () => {
    const text = [title.trim(), body].filter(Boolean).join("\n\n");
    try {
      await copyText(text);
      setCopyMessage("已复制全文");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限后重试。");
    }
  };
  return (
    <section
      ref={editorSurfaceRef}
      className={`notes-editor-surface flex h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)] ${isFallbackFullscreen ? "fixed inset-0 z-[80] h-[var(--app-viewport-height)]" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[var(--toolbar-height)] shrink-0 items-center gap-1.5 border-b px-2 sm:gap-2 sm:px-5">
          <input
            aria-label="笔记标题"
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              dirty(nextTitle, body);
            }}
            className="min-w-20 flex-1 bg-transparent text-base font-semibold tracking-[-0.01em] outline-none placeholder:text-[var(--text-tertiary)] sm:text-lg"
            placeholder="无标题笔记"
          />
          <span
            aria-live="polite"
            className={`hidden shrink-0 text-[11px] min-[520px]:inline ${saveHasError ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}
          >
            {statusLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyFullNote()}
            aria-label="复制笔记全文"
          >
            <Copy aria-hidden="true" />
            <span className="hidden sm:inline">复制全文</span>
          </Button>
          <Button
            variant={state === "已保存" ? "ghost" : "outline"}
            size="sm"
            onClick={() => void save()}
            aria-label={`立即保存，当前状态：${statusLabel}`}
          >
            <SaveIcon aria-hidden="true" />
            <span>{state === "正在保存" ? "保存中" : "保存"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreenActive ? "退出全屏编辑" : "进入全屏编辑"}
          >
            {fullscreenActive ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            <span className="hidden sm:inline">{fullscreenActive ? "退出全屏" : "全屏"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={noteAiPanel.toggle}
            aria-label="打开笔记 AI"
            aria-pressed={noteAiPanel.isOpen}
          >
            <Sparkles aria-hidden="true" />
            <span className="hidden sm:inline">AI</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="笔记更多操作">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={isExporting}
                onSelect={() => {
                  setPdfError("");
                  setPdfSnapshot({ title: title || "无标题笔记", body });
                }}
              >
                <Download aria-hidden="true" />
                {isExporting ? "正在生成 PDF…" : "导出 PDF"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {state !== "已保存" ? (
          <p
            role={saveHasError ? "alert" : "status"}
            aria-live="polite"
            className={`border-b px-3 py-1.5 text-xs min-[520px]:hidden ${saveHasError ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}
          >
            {state === "保存失败"
              ? "保存失败，本机恢复草稿已保留。请检查网络后点击保存。"
              : state === "版本冲突"
                ? "检测到其他设备修改。当前草稿已保留，请刷新后核对内容。"
                : statusLabel}
          </p>
        ) : null}
        {pdfError ? <p role="alert" className="px-4 py-2 text-sm text-[var(--danger)] sm:px-6">{pdfError}</p> : null}
        {copyMessage ? <p role="status" aria-live="polite" className={`px-4 py-2 text-sm sm:px-6 ${copyMessage.includes("失败") ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{copyMessage}</p> : null}
        {imageUploadMessage ? (
          <p role="status" aria-live="polite" className={`px-4 py-2 text-sm sm:px-6 ${imageUploadMessage.includes("失败") || imageUploadMessage.includes("不支持") ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
            {imageUploadMessage}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--surface-canvas)]">
          <VisualMarkdownEditor
            markdown={body}
            noteId={note.id}
            onImageUploadStatus={setImageUploadMessage}
            onOpenAi={noteAiPanel.open}
            onSelectionChange={setSelection}
            onChange={handleBodyChange}
            recentNoteLinks={recentNoteLinks}
          />
        </div>
      </div>
      {noteAiPanel.isOpen ? <NoteAiAssistant
        open={noteAiPanel.isOpen}
        onOpen={noteAiPanel.open}
        onClose={noteAiPanel.close}
        noteId={note.id}
        title={title}
        bodyMarkdown={body}
        defaultModel={noteAiDefaultModel}
        selection={selection}
        onReplaceNote={(suggestion) => {
          setBody(suggestion);
          dirty(title, suggestion);
        }}
        onInsertNote={(suggestion) => {
          const nextBody = `${body}${body.trim() ? "\n\n" : ""}${suggestion}`;
          setBody(nextBody);
          dirty(title, nextBody);
        }}
      /> : null}
      {pdfSnapshot ? (
        <article id="note-pdf-preview" ref={pdfPreviewRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-12 text-[15px]">
          <h1 className="mb-7 text-3xl font-semibold text-zinc-900">{pdfSnapshot.title}</h1>
          <MarkdownDocument body={pdfSnapshot.body} />
        </article>
      ) : null}
    </section>
  );
}
