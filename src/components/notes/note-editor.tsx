"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { isInternalEntityHref } from "@/features/links/parser";
import { recordNotePdfExport, saveNote, setNoteContentOrigin } from "@/features/notes/actions";
import { isAiGeneratedNote } from "@/features/notes/content-origin";
import { markdownFilename } from "@/features/notes/utils";
import { publishNotesNavigatorTitle } from "@/features/notes/navigator-title-sync";
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import { loadWorkspaceSession, removeWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { lastOpenedNoteSessionKey, lastOpenedNoteTtlMs } from "@/features/notes/navigation";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { perfMark } from "@/lib/perf";
import {
  noteAutosaveDebounceMs,
  noteAutosaveMaxWaitMs,
  noteDraftRecoveryDebounceMs,
  noteDraftRecoveryTtlMs,
} from "@/features/notes/editor/save-policy";

const VisualMarkdownEditor = dynamic(() => import("@/components/notes/visual-markdown-editor").then((module) => module.VisualMarkdownEditor), {
  ssr: false,
  loading: () => <div className="notes-editor-loading min-h-80 bg-[var(--surface-canvas)] p-6 text-sm text-[var(--text-tertiary)]">正在载入 Markdown 编辑器…</div>,
});
const NoteAiAssistant = dynamic(() => import("@/components/notes/note-ai-assistant").then((module) => module.NoteAiAssistant), { ssr: false });

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null; content_origin?: "human" | "ai_generated" };
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
    a: ({ children, href }) => isInternalEntityHref(href) ? <a href={href} className="text-[#365F78] underline underline-offset-2">{children}</a> : <a href={href} target="_blank" rel="noreferrer" className="text-[#365F78] underline underline-offset-2">{children}</a>,
    table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border bg-zinc-50 px-3 py-2 font-medium">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
    hr: () => <hr className="my-7 border-zinc-200" />,
  }}>{body}</ReactMarkdown>;
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

export function NoteEditor({ note, noteAiDefaultModel }: { note: Note; noteAiDefaultModel: DeepSeekModelId }) {
  const feedback = useActionFeedback();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [titleUndoStack, setTitleUndoStack] = useState<string[]>([]);
  const titleUndoStackRef = useRef<string[]>([]);
  const [state, setState] = useState<SaveState>("已保存");
  const [lastSavedAt, setLastSavedAt] = useState(note.last_saved_at);
  const [editVersion, setEditVersion] = useState(0);
  const [pdfSnapshot, setPdfSnapshot] = useState<PdfSnapshot | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const noteAiPanel = useWorkspacePanel(`note-ai:${note.id}`);
  const [selection, setSelection] = useState<NoteSelection | null>(null);
  const [contentOrigin, setContentOrigin] = useState(note.content_origin ?? "human");
  const [isChangingContentOrigin, startContentOriginTransition] = useTransition();
  const pdfPreviewRef = useRef<HTMLElement>(null);
  const editorSurfaceRef = useRef<HTMLElement>(null);
  const latestContentRef = useRef({ title: note.title, body: note.body_markdown });
  const revisionRef = useRef(note.revision);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveQueuedRef = useRef(false);
  const isDirtyRef = useRef(false);
  const pendingDraftRef = useRef<NoteDraftSession | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const noteSessionKey = `notes:draft:${note.id}`;

  const persistDraft = useCallback((draft: NoteDraftSession) => {
    saveWorkspaceSession<NoteDraftSession>(noteSessionKey, draft, noteDraftRecoveryTtlMs);
  }, [noteSessionKey]);
  const clearQueuedDraft = useCallback(() => {
    pendingDraftRef.current = null;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);
  const flushDraft = useCallback(() => {
    const draft = pendingDraftRef.current;
    clearQueuedDraft();
    if (draft) persistDraft(draft);
  }, [clearQueuedDraft, persistDraft]);
  const queueDraft = useCallback((nextTitle: string, nextBody: string, baseRevision = revisionRef.current) => {
    pendingDraftRef.current = { title: nextTitle, body: nextBody, baseRevision };
    if (draftTimerRef.current !== null) return;
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      const draft = pendingDraftRef.current;
      pendingDraftRef.current = null;
      if (draft) persistDraft(draft);
    }, noteDraftRecoveryDebounceMs);
  }, [persistDraft]);
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
      publishNotesNavigatorTitle(note.id, draft.title);
      setBody(draft.body);
      isDirtyRef.current = true;
      setState("有未保存修改");
      setEditVersion((version) => version + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [note.body_markdown, note.id, note.title, noteSessionKey]);

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
            flushDraft();
            setState("版本冲突");
            return;
          }
          revisionRef.current = result.revision;
          setLastSavedAt(result.lastSavedAt);
          perfMark("note-autosave-end", { noteId: note.id, revision: result.revision });
          const latest = latestContentRef.current;
          if (latest.title === snapshot.title && latest.body === snapshot.body) {
            isDirtyRef.current = false;
            clearQueuedDraft();
            setState("已保存");
            removeWorkspaceSession(noteSessionKey);
          } else {
            isDirtyRef.current = true;
            setState("有未保存修改");
            queueDraft(latest.title, latest.body, result.revision);
          }
        } catch {
          perfMark("note-autosave-failed", { noteId: note.id });
          const latest = latestContentRef.current;
          isDirtyRef.current = true;
          pendingDraftRef.current = { title: latest.title, body: latest.body, baseRevision: revisionRef.current };
          flushDraft();
          setState("保存失败");
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
  }, [clearQueuedDraft, flushDraft, note.id, noteSessionKey, queueDraft]);

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
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); flushDraft(); void save(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [flushDraft, save]);
  useEffect(() => {
    const flush = () => {
      flushDraft();
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
  }, [flushDraft, save]);
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
        feedback.show({ message: "PDF 已导出", tone: "success" });
        void recordNotePdfExport(note.id).catch(() => undefined);
      } catch {
        if (!cancelled) feedback.show({ message: "PDF 暂时无法生成，请重试。", tone: "error" });
      } finally {
        if (!cancelled) setPdfSnapshot(null);
      }
    };
    void exportPdf();
    return () => { cancelled = true; };
  }, [feedback, note.id, pdfSnapshot]);

  const dirty = useCallback((nextTitle: string, nextBody: string) => {
    latestContentRef.current = { title: nextTitle, body: nextBody };
    isDirtyRef.current = true;
    setState("有未保存修改");
    setEditVersion((version) => version + 1);
    queueDraft(nextTitle, nextBody);
  }, [queueDraft]);
  const handleBodyChange = useCallback((value: string) => {
    setBody(value);
    dirty(title, value);
  }, [dirty, title]);
  // AI 生成标题：直接替换标题，旧标题压栈供撤回（支持连续多次生成逐步撤回）。
  const handleAiReplaceTitle = useCallback((newTitle: string) => {
    const next = newTitle
      .trim()
      .replace(/^[「『“”‘’"']+/, "")
      .replace(/[」』“”‘’"']+$/, "")
      .trim();
    if (!next || next === title) return;
    titleUndoStackRef.current = [...titleUndoStackRef.current, title];
    setTitleUndoStack([...titleUndoStackRef.current]);
    setTitle(next);
    publishNotesNavigatorTitle(note.id, next);
    dirty(next, body);
  }, [body, dirty, note.id, title]);
  const handleAiUndoTitle = useCallback(() => {
    const stack = titleUndoStackRef.current;
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    titleUndoStackRef.current = stack.slice(0, -1);
    setTitleUndoStack([...titleUndoStackRef.current]);
    setTitle(prev);
    publishNotesNavigatorTitle(note.id, prev);
    dirty(prev, body);
  }, [body, dirty, note.id]);
  const isExporting = Boolean(pdfSnapshot);
  const fullscreenActive = isFullscreen || isFallbackFullscreen;
  const statusLabel = state === "已保存" ? savedTimeLabel(lastSavedAt) : state;
  const saveHasError = state === "保存失败" || state === "版本冲突";
  const aiGenerated = isAiGeneratedNote(contentOrigin);
  const toggleContentOrigin = () => {
    const next = aiGenerated ? "human" : "ai_generated";
    setContentOrigin(next);
    startContentOriginTransition(async () => {
      try {
        await setNoteContentOrigin({ noteId: note.id, contentOrigin: next });
        feedback.show({
          message: next === "ai_generated"
            ? "已标记为 AI 生成；AI 背景读取会跳过此笔记。"
            : "已标记为人工内容。",
          tone: "success",
        });
      } catch {
        setContentOrigin(aiGenerated ? "ai_generated" : "human");
        feedback.show({ message: "标记失败，请检查网络后重试。", tone: "error" });
      }
    });
  };
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
      feedback.show({ message: "已复制笔记全文", tone: "success" });
    } catch {
      feedback.show({ message: "复制失败，请检查浏览器权限。", tone: "error" });
    }
  };
  const handleImageUploadStatus = useCallback((message: string) => {
    if (!message || message.includes("正在")) return;
    const error = message.includes("失败") || message.includes("不支持") || message.includes("失效") || message.includes("未能");
    feedback.show({ message, tone: error ? "error" : "success" });
  }, [feedback]);
  const startPdfExport = () => setPdfSnapshot({ title: title || "无标题笔记", body });

  return (
    <section
      ref={editorSurfaceRef}
      className={`notes-editor-surface flex h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)] ${isFallbackFullscreen ? "fixed inset-0 z-[80] h-[var(--app-viewport-height)]" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[var(--toolbar-height)] shrink-0 items-center gap-1 border-b border-[var(--separator)] pl-11 pr-11 sm:gap-1.5 sm:pl-5 sm:pr-12">
          {aiGenerated ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--ai-accent-soft)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--ai-accent)]"
              title="AI 生成内容：AI 读取背景时不会引用此笔记"
            >
              <Sparkles aria-hidden="true" className="size-3" />
              <span className="hidden min-[430px]:inline">AI</span>
            </span>
          ) : null}
          <input
            aria-label="笔记标题"
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              // 手动编辑标题后 AI 标题的撤回栈失效，避免撤回覆盖手动修改。
              titleUndoStackRef.current = [];
              setTitleUndoStack([]);
              setTitle(nextTitle);
              publishNotesNavigatorTitle(note.id, nextTitle);
              dirty(nextTitle, body);
            }}
            className={`min-w-16 flex-1 bg-transparent text-[15px] font-semibold tracking-[-0.015em] outline-none placeholder:text-[var(--text-tertiary)] sm:min-w-24 sm:text-lg ${aiGenerated ? "text-[var(--ai-accent)]" : ""}`}
            placeholder="无标题笔记"
          />
          <span
            aria-live="polite"
            className={`hidden shrink-0 text-[10.5px] min-[760px]:inline ${saveHasError ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}
          >
            {statusLabel}
          </span>
          {titleUndoStack.length ? (
            <button
              type="button"
              onClick={handleAiUndoTitle}
              title={`恢复标题：${titleUndoStack[titleUndoStack.length - 1]}`}
              className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] px-1.5 py-1 text-[10.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-selected)] hover:text-[var(--text-primary)] sm:px-2"
            >
              撤回<span className="hidden sm:inline">标题</span>
            </button>
          ) : null}
          <Button
            variant={state === "已保存" ? "ghost" : "outline"}
            size="sm"
            onClick={() => { flushDraft(); void save(); }}
            aria-label={`立即保存，当前状态：${statusLabel}`}
          >
            <SaveIcon aria-hidden="true" />
            <span className="hidden min-[430px]:inline">{state === "正在保存" ? "保存中" : "保存"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={aiGenerated}
            onClick={noteAiPanel.toggle}
            aria-label={aiGenerated ? "AI 生成内容不会作为 AI 上下文读取" : "打开笔记 AI"}
            aria-pressed={noteAiPanel.isOpen}
          >
            <Sparkles aria-hidden="true" />
            <span className="hidden sm:inline">AI</span>
          </Button>
          <div className="hidden items-center gap-0.5 sm:flex">
            <Button
              variant={aiGenerated ? "outline" : "ghost"}
              size="sm"
              disabled={isChangingContentOrigin}
              onClick={toggleContentOrigin}
              aria-pressed={aiGenerated}
              className={aiGenerated ? "border-[var(--ai-accent)] text-[var(--ai-accent)]" : ""}
              aria-label={aiGenerated ? "取消 AI 生成标记" : "标记为 AI 生成内容"}
              title={aiGenerated ? "AI 读取背景时会跳过此笔记；点击恢复为人工内容" : "标记后，AI 读取背景时会跳过此笔记"}
            >
              <Sparkles aria-hidden="true" />
              <span className="hidden lg:inline">{isChangingContentOrigin ? "更新中…" : aiGenerated ? "AI 生成" : "标记 AI"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void copyFullNote()} aria-label="复制笔记全文">
              <Copy aria-hidden="true" />
              <span className="hidden lg:inline">复制全文</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()} aria-label={fullscreenActive ? "退出全屏编辑" : "进入全屏编辑"}>
              {fullscreenActive ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              <span className="hidden lg:inline">{fullscreenActive ? "退出全屏" : "全屏"}</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={isExporting} onClick={startPdfExport} aria-label="导出笔记 PDF">
              <Download aria-hidden="true" />
              <span className="hidden lg:inline">{isExporting ? "正在生成 PDF…" : "导出 PDF"}</span>
            </Button>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label="更多笔记操作">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={isChangingContentOrigin} onSelect={toggleContentOrigin}>
                <Sparkles aria-hidden="true" />{aiGenerated ? "取消 AI 生成标记" : "标记为 AI 生成"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyFullNote()}><Copy aria-hidden="true" />复制全文</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void toggleFullscreen()}>{fullscreenActive ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{fullscreenActive ? "退出全屏" : "全屏编辑"}</DropdownMenuItem>
              <DropdownMenuItem disabled={isExporting} onSelect={startPdfExport}><Download aria-hidden="true" />{isExporting ? "正在生成 PDF…" : "导出 PDF"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {state !== "已保存" ? (
          <p
            role={saveHasError ? "alert" : "status"}
            aria-live="polite"
            className={`border-b border-[var(--separator)] px-3 py-1.5 text-[11px] min-[760px]:hidden ${saveHasError ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}
          >
            {state === "保存失败"
              ? "保存失败，本机恢复草稿已保留。请检查网络后点击保存。"
              : state === "版本冲突"
                ? "检测到其他设备修改。当前草稿已保留，请刷新后核对内容。"
                : statusLabel}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--surface-canvas)]">
          <VisualMarkdownEditor
            markdown={body}
            noteId={note.id}
            onImageUploadStatus={handleImageUploadStatus}
            onOpenAi={aiGenerated ? undefined : noteAiPanel.open}
            onSelectionChange={setSelection}
            onChange={handleBodyChange}
          />
        </div>
      </div>
      <NoteAiAssistant
        key={note.id}
        open={aiGenerated ? false : noteAiPanel.isOpen}
        onOpen={noteAiPanel.open}
        onClose={noteAiPanel.close}
        noteId={note.id}
        title={title}
        bodyMarkdown={body}
        defaultModel={noteAiDefaultModel}
        selection={selection}
        onClearSelection={() => setSelection(null)}
        onReplaceNote={(suggestion) => {
          setBody(suggestion);
          dirty(title, suggestion);
        }}
        onReplaceTitle={handleAiReplaceTitle}
        onInsertNote={(suggestion) => {
          const nextBody = `${body}${body.trim() ? "\n\n" : ""}${suggestion}`;
          setBody(nextBody);
          dirty(title, nextBody);
        }}
      />
      {pdfSnapshot ? (
        <article id="note-pdf-preview" ref={pdfPreviewRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-12 text-[15px]">
          <h1 className="mb-7 text-3xl font-semibold text-zinc-900">{pdfSnapshot.title}</h1>
          <MarkdownDocument body={pdfSnapshot.body} />
        </article>
      ) : null}
    </section>
  );
}
