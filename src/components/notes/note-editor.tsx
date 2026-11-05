"use client";

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { workbenchPositionSchema } from "@/features/workbench/contracts";
import { useWorkbenchActive } from "@/components/workbench/workbench-activity";
import { useNoteContinuity } from "./use-note-continuity";
import { NoteHeaderActionsContext } from "./note-header-actions-context";
import { noteDocumentCache } from "@/features/notes/document-resource";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  Copy,
  Download,
  Link2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  History,
  Save as SaveIcon,
  Sparkles,
  BookOpen,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteTitleMotion } from "@/components/notes/notes-motion";
import { NoteReadingView } from "@/components/notes/note-reading-view";
import { NoteConflictResolver } from "@/components/notes/note-conflict-resolver";
import { NoteVersionHistory } from "@/components/notes/note-version-history";
import { canApplyNoteConflictMerge } from "@/features/notes/editor/conflict-resolution";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { noteReferenceMarkdown } from "@/features/notes/links/reference";
import { isInternalEntityHref } from "@/features/links/parser";
import { captureNoteBeforeHistoryRestore, recordNotePdfExport, saveNote, setNoteContentOrigin } from "@/features/notes/actions";
import { isAiGeneratedNote } from "@/features/notes/content-origin";
import { markdownFilename } from "@/features/notes/utils";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
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
  loading: () => <div aria-label="正在载入编辑器" className="notes-editor-loading min-h-80 bg-[var(--surface-canvas)]" />,
});
const NoteAiAssistant = dynamic(() => import("@/components/notes/note-assistant-loader").then((module) => module.NoteAssistantLoader), { ssr: false });

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null; content_origin?: "human" | "ai_generated" };
type PdfSnapshot = { title: string; body: string };
type NoteDraftSession = { title: string; body: string; baseRevision: number };
type SaveState = "已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突";

const pdfCloneStyles = `
  .note-pdf-export-preview, .note-pdf-export-preview * { color: #27272a !important; border-color: #e7e5e4 !important; }
  .note-pdf-export-preview { position: absolute !important; left: 0 !important; top: 0 !important; z-index: 1 !important; width: 794px !important; min-height: 1px !important; background: #ffffff !important; }
  .note-pdf-export-preview h1, .note-pdf-export-preview h2, .note-pdf-export-preview h3 { color: #18181b !important; }
  .note-pdf-export-preview pre { background: #18181b !important; color: #f4f4f5 !important; }
  .note-pdf-export-preview pre * { color: #f4f4f5 !important; }
  .note-pdf-export-preview code { background: #f4f4f5 !important; }
  .note-pdf-export-preview pre code { background: transparent !important; }
  .note-pdf-export-preview th { background: #f4f4f5 !important; }
`;

function MarkdownDocument({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    h1: ({ children }) => <h1 className="mb-5 mt-1 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-8 border-b pb-2 text-xl font-semibold text-[var(--text-primary)]">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold text-[var(--text-primary)]">{children}</h3>,
    p: ({ children }) => <p className="mb-4 leading-7 text-[var(--text-secondary)]">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6 text-[var(--text-secondary)]">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-[var(--text-secondary)]">{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => <blockquote className="mb-4 border-l-2 border-[var(--accent)] pl-4 italic text-[var(--text-secondary)]">{children}</blockquote>,
    pre: ({ children }) => <pre className="mb-4 overflow-x-auto bg-[var(--accent)] p-4 text-sm leading-6 text-[var(--text-tertiary)]">{children}</pre>,
    code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-[var(--surface-control)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--text-primary)]">{children}</code>,
    a: ({ children, href }) => isInternalEntityHref(href) ? <a href={href} className="text-[var(--accent)] underline underline-offset-2">{children}</a> : <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline underline-offset-2">{children}</a>,
    table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border bg-[var(--surface-canvas)] px-3 py-2 font-medium">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
    hr: () => <hr className="my-7 border-[var(--separator)]" />,
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

const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

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

export function NoteEditor({ note, noteAiDefaultModel, loadAiPreferences = false }: { note: Note; noteAiDefaultModel: DeepSeekModelId; loadAiPreferences?: boolean }) {
  const paneActive = useWorkbenchActive();
  const headerActionsHost = useContext(NoteHeaderActionsContext);
  const headerActionsTarget = headerActionsHost?.target;
  const feedback = useActionFeedback();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrated, serverHydrated);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [bodyRevision, setBodyRevision] = useState(0);
  const [draftBaseline] = useState(() => ({ title: note.title, body: note.body_markdown }));
  const replaceBody = useCallback((value: string) => { setBody(value); setBodyRevision((revision) => revision + 1); }, []);
  const { reading, switchReading, restoreContinuity, readingPaneRef, rememberReading, rememberPosition, onEditorReady, interruptEditorRestore } = useNoteContinuity(note.id);
  useEffect(() => {
    const restore = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.noteId !== note.id) return;
      const parsed = workbenchPositionSchema.safeParse(event.detail.position);
      if (!parsed.success) return;
      const position = parsed.data;
      restoreContinuity({ reading: position.reading ?? false, ...(position.sourceLine ? { reader: { line: position.sourceLine, offset: position.sourceOffset ?? 0 } } : {}), ...(position.anchor !== undefined ? { editor: { anchor: position.anchor, head: position.head ?? position.anchor, viewport: { line: position.sourceLine ?? 1, offset: position.sourceOffset ?? 0 }, scrollLeft: 0 } } : {}) });
    };
    window.addEventListener("personal-os:restore-note-position", restore);
    return () => window.removeEventListener("personal-os:restore-note-position", restore);
  }, [note.id, restoreContinuity]);
  const [titleUndoStack, setTitleUndoStack] = useState<string[]>([]);
  const titleUndoStackRef = useRef<string[]>([]);
  const [state, setState] = useState<SaveState>("已保存");
  const [draftRecoveryUnavailable, setDraftRecoveryUnavailable] = useState(false);
  const [conflictSnapshot, setConflictSnapshot] = useState<NoteDraftSession | null>(null);
  // undefined = closed; null = open history; string = open a specific version.
  const [historyRequest, setHistoryRequest] = useState<string | null | undefined>(undefined);
  const [lastSavedAt, setLastSavedAt] = useState(note.last_saved_at);
  const [editVersion, setEditVersion] = useState(0);
  const [pdfSnapshot, setPdfSnapshot] = useState<PdfSnapshot | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const noteAiPanel = useWorkspacePanel(`note-ai:${note.id}`);
  const [aiVisited, setAiVisited] = useState(false);
  const openAi = useCallback(() => { setAiVisited(true); noteAiPanel.open(); }, [noteAiPanel]);
  const toggleAi = () => { setAiVisited(true); noteAiPanel.toggle(); };
  const [selection, setSelection] = useState<NoteSelection | null>(null);
  const [contentOrigin, setContentOrigin] = useState(note.content_origin ?? "human");
  const [isChangingContentOrigin, startContentOriginTransition] = useTransition();
  const pdfPreviewRef = useRef<HTMLElement>(null);
  const editorSurfaceRef = useRef<HTMLElement>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const [editorPortalContainer, setEditorPortalContainer] = useState<HTMLElement | null>(null);
  const attachEditorSurface = useCallback((element: HTMLElement | null) => {
    editorSurfaceRef.current = element;
    setEditorPortalContainer(element);
  }, []);
  const latestContentRef = useRef({ title: note.title, body: note.body_markdown });
  const revisionRef = useRef(note.revision);
  const knownRemoteRevisionRef = useRef(note.revision);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveQueuedRef = useRef(false);
  const isDirtyRef = useRef(false);
  const pendingDraftRef = useRef<NoteDraftSession | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const noteSessionKey = `notes:draft:${note.id}`;
  useEffect(() => {
    const open = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.noteId !== note.id) return;
      setHistoryRequest(typeof event.detail.versionId === "string" ? event.detail.versionId : null);
    };
    window.addEventListener("personal-os:review-note-version", open);
    return () => window.removeEventListener("personal-os:review-note-version", open);
  }, [note.id]);

  useEffect(() => {
    knownRemoteRevisionRef.current = Math.max(knownRemoteRevisionRef.current, note.revision);
    if (note.revision <= revisionRef.current) return;
    if (isDirtyRef.current) {
      // Keep the optimistic revision unchanged so a subsequent save cannot overwrite remote edits.
      const timer = window.setTimeout(() => setState("版本冲突"), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      if (isDirtyRef.current) { if (note.revision > revisionRef.current) setState("版本冲突"); return; }
      if (note.revision <= revisionRef.current) return;
      latestContentRef.current = { title: note.title, body: note.body_markdown };
      revisionRef.current = note.revision;
      setTitle(note.title); replaceBody(note.body_markdown); setLastSavedAt(note.last_saved_at);
      publishNotesNavigatorTitle(note.id, note.title);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [note.id, note.revision, note.title, note.body_markdown, note.last_saved_at, replaceBody]);

  const persistDraft = useCallback((draft: NoteDraftSession) => {
    const stored = saveWorkspaceSession<NoteDraftSession>(noteSessionKey, draft, noteDraftRecoveryTtlMs);
    setDraftRecoveryUnavailable(!stored);
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
    if (!draft || (draft.title === draftBaseline.title && draft.body === draftBaseline.body)) return;
    const timer = window.setTimeout(() => {
      latestContentRef.current = { title: draft.title, body: draft.body };
      if (Number.isInteger(draft.baseRevision) && draft.baseRevision >= 0) {
        revisionRef.current = draft.baseRevision;
      }
      setTitle(draft.title);
      publishNotesNavigatorTitle(note.id, draft.title);
      replaceBody(draft.body);
      isDirtyRef.current = true;
      setState("有未保存修改");
      setEditVersion((version) => version + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftBaseline, note.id, noteSessionKey, replaceBody]);

  const save = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return saveInFlightRef.current;
    }
    if (!isDirtyRef.current) return;
    if (knownRemoteRevisionRef.current > revisionRef.current) { flushDraft(); setState("版本冲突"); return; }
    const scopeIsCurrent = captureWorkspaceScope();

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
          if (!scopeIsCurrent()) return;
          if (result.status === "conflict") {
            isDirtyRef.current = true;
            flushDraft();
            setState("版本冲突");
            return;
          }
          if (result.revision < knownRemoteRevisionRef.current) {
            revisionRef.current = result.revision;
            isDirtyRef.current = true;
            const latest = latestContentRef.current;
            pendingDraftRef.current = { ...latest, baseRevision: result.revision };
            flushDraft(); setState("版本冲突"); return;
          }
          notesWorkspaceResource.mutate((workspace) => workspace ? { ...workspace,
            notes: workspace.notes.map((row) => row.id === note.id ? { ...row, title: snapshot.title, updated_at: result.lastSavedAt } : row),
            navigatorNotes: workspace.navigatorNotes.map((row) => row.id === note.id ? { ...row, title: snapshot.title, updated_at: result.lastSavedAt } : row),
          } : workspace);
          notesWorkspaceResource.invalidate();
          noteDocumentCache.saved(note.id, snapshot, result.revision, result.lastSavedAt);
          revisionRef.current = result.revision;
          setLastSavedAt(result.lastSavedAt);
          perfMark("note-autosave-end", { noteId: note.id, revision: result.revision });
          const latest = latestContentRef.current;
          if (latest.title === snapshot.title && latest.body === snapshot.body) {
            isDirtyRef.current = false;
            clearQueuedDraft();
            setState("已保存");
            setDraftRecoveryUnavailable(false);
            removeWorkspaceSession(noteSessionKey);
          } else {
            isDirtyRef.current = true;
            setState("有未保存修改");
            queueDraft(latest.title, latest.body, result.revision);
          }
        } catch {
          if (!scopeIsCurrent()) return;
          perfMark("note-autosave-failed", { noteId: note.id });
          const latest = latestContentRef.current;
          isDirtyRef.current = true;
          pendingDraftRef.current = { title: latest.title, body: latest.body, baseRevision: revisionRef.current };
          flushDraft();
          setState(knownRemoteRevisionRef.current > revisionRef.current ? "版本冲突" : "保存失败");
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
  useEffect(() => { const handler = (event: KeyboardEvent) => { const focused = document.activeElement; const inEditor = editorSurfaceRef.current?.contains(focused) || headerActionsTarget?.contains(focused); if (paneActive && inEditor && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); flushDraft(); void save(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [flushDraft, save, paneActive, headerActionsTarget]);
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
      if (event.key === "Escape" && !event.defaultPrevented) setIsFallbackFullscreen(false);
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
    dirty(latestContentRef.current.title, value);
  }, [dirty]);

  const applyHistoricalDraft = useCallback(async (next: { title: string; body: string }) => {
    if (isDirtyRef.current || saveInFlightRef.current || state !== "已保存")
      return { ok: false, message: "请先完成当前草稿的保存，再恢复历史内容。未保存修改不会被覆盖。" };
    if (knownRemoteRevisionRef.current > revisionRef.current)
      return { ok: false, message: "检测到更新的云端修订，请先解决版本冲突。" };
    const originalRevision = revisionRef.current;
    if (next.title === latestContentRef.current.title && next.body === latestContentRef.current.body)
      return { ok: true, message: "所选内容与当前文档一致。" };
    try {
      const checkpoint = await captureNoteBeforeHistoryRestore({ noteId: note.id, expectedRevision: originalRevision });
      if (checkpoint.status !== "ready") {
        setState("版本冲突");
        return { ok: false, message: "云端版本已发生变化。未修改原文，请核对并重试。" };
      }
      if (isDirtyRef.current || saveInFlightRef.current || revisionRef.current !== originalRevision)
        return { ok: false, message: "在准备恢复时出现新的修改，已终止恢复；此前版本仍已留存。" };
      setTitle(next.title);
      replaceBody(next.body);
      publishNotesNavigatorTitle(note.id, next.title);
      dirty(next.title, next.body);
      feedback.show({ message: "历史内容已进入草稿，正在通过修订号校验自动保存。", tone: "success" });
      return { ok: true, message: "已加入编辑器草稿，正在自动保存。" };
    } catch {
      return { ok: false, message: "恢复前快照保存失败，原文未被修改。请检查网络后重试。" };
    }
  }, [dirty, feedback, note.id, replaceBody, state]);
  const applyConflictResolution = useCallback((
    resolved: { title: string; body: string; revision: number },
    original: { title: string; body: string },
  ): boolean => {
    const current = latestContentRef.current;
    if (state !== "版本冲突" || !canApplyNoteConflictMerge({
      localNow: current,
      localWhenOpened: original,
      localRevision: revisionRef.current,
      knownRemoteRevision: knownRemoteRevisionRef.current,
      selectedRemoteRevision: resolved.revision,
      saveInProgress: Boolean(saveInFlightRef.current),
    })) return false;
    if (resolved.title.length > 240 || resolved.body.length > 200_000) return false;
    // Explicit user confirmation is the only path that advances the baseline.
    // A subsequent concurrent update is still rejected by saveNote's CAS.
    revisionRef.current = resolved.revision;
    knownRemoteRevisionRef.current = Math.max(knownRemoteRevisionRef.current, resolved.revision);
    setTitle(resolved.title);
    replaceBody(resolved.body);
    publishNotesNavigatorTitle(note.id, resolved.title);
    dirty(resolved.title, resolved.body);
    setConflictSnapshot(null);
    return true;
  }, [dirty, note.id, replaceBody, state]);
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
    dirty(next, latestContentRef.current.body);
  }, [dirty, note.id, title]);
  const handleAiUndoTitle = useCallback(() => {
    const stack = titleUndoStackRef.current;
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    titleUndoStackRef.current = stack.slice(0, -1);
    setTitleUndoStack([...titleUndoStackRef.current]);
    setTitle(prev);
    publishNotesNavigatorTitle(note.id, prev);
    dirty(prev, latestContentRef.current.body);
  }, [dirty, note.id]);
  const isExporting = Boolean(pdfSnapshot);
  const fullscreenActive = isFullscreen || isFallbackFullscreen;
  useEffect(() => {
    if (wasFullscreen.current && !fullscreenActive) fullscreenTriggerRef.current?.focus();
    wasFullscreen.current = fullscreenActive;
  }, [fullscreenActive]);
  // Browser-local clock formatting starts after hydration; SSR and its first
  // client pass share the truthful, timezone-independent saved state.
  const statusLabel = state === "已保存" && hydrated ? savedTimeLabel(lastSavedAt) : state;
  const saveHasError = state === "保存失败" || state === "版本冲突";
  const saveNeedsAttention = state === "有未保存修改";
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
  const copyCurrentNoteReference = async () => {
    try {
      await copyText(noteReferenceMarkdown(title, `/notes/${note.id}`));
      feedback.show({ message: "已复制笔记引用，可粘贴到笔记、任务或日程", tone: "success" });
    } catch {
      feedback.show({ message: "复制失败，请检查浏览器权限后重试。", tone: "error" });
    }
  };
  const handleImageUploadStatus = useCallback((message: string) => {
    if (!message || message.includes("正在")) return;
    const error = message.includes("失败") || message.includes("不支持") || message.includes("失效") || message.includes("未能");
    feedback.show({ message, tone: error ? "error" : "success" });
  }, [feedback]);
  const startPdfExport = () => setPdfSnapshot({ title: title || "无标题笔记", body });
  // Portal existing actions into the document chrome without remounting CodeMirror.
  // Native fullscreen cannot show nodes outside the fullscreen editor surface.
  const headerActions = (
    <div className="notes-editor-actions flex min-h-11 flex-wrap items-center gap-1">
      <div role="group" aria-label="笔记阅读方式" data-mode={reading ? "reading" : "editing"} className="notes-mode-control mr-auto flex shrink-0 gap-1 md:mr-3">
        <button type="button" aria-label="编辑" aria-pressed={!reading} onClick={() => switchReading(false)} className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] ${!reading ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><PenLine aria-hidden="true" className="size-4" /><span className="notes-mode-label">编辑</span></button>
        <button type="button" aria-label="阅读" aria-pressed={reading} onClick={() => switchReading(true)} className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] ${reading ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><BookOpen aria-hidden="true" className="size-4" /><span className="notes-mode-label">阅读</span></button>
      </div>
      <span aria-live="polite" title={statusLabel} className={`notes-save-status order-last basis-full pt-1 text-[12px] tabular-nums md:order-none md:mr-auto md:basis-auto md:pt-0 ${saveHasError ? "text-[var(--danger)]" : saveNeedsAttention ? "text-[var(--warning)]" : "text-[var(--text-secondary)]"}`}>
        {statusLabel}
      </span>
      <Button variant={state === "已保存" ? "ghost" : "outline"} size="sm" className="notes-save-button max-md:size-11 max-md:px-0" onClick={() => { flushDraft(); void save(); }} aria-label={`立即保存，当前状态：${statusLabel}`} title="立即保存">
        <SaveIcon aria-hidden="true" /><span className="notes-action-label hidden lg:inline">保存</span>
      </Button>
      <Button variant="ghost" size="sm" className="notes-ai-button max-md:size-11 max-md:px-0" disabled={aiGenerated} onClick={toggleAi} aria-label={aiGenerated ? "AI 生成内容不会作为 AI 上下文读取" : "打开笔记 AI"} title="笔记 AI" aria-pressed={noteAiPanel.isOpen}>
        <Sparkles aria-hidden="true" /><span className="notes-action-label hidden lg:inline">AI</span>
      </Button>
      <Button ref={fullscreenTriggerRef} variant="ghost" size="sm" className="notes-focus-button max-md:size-11 max-md:px-0" onClick={() => void toggleFullscreen()} aria-label={fullscreenActive ? "退出专注" : "进入专注"} title={fullscreenActive ? "退出专注" : "专注编辑"}>
        {fullscreenActive ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}<span className="notes-action-label hidden lg:inline">{fullscreenActive ? "退出专注" : "专注"}</span>
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="notes-more-button max-md:size-11" aria-label="更多笔记操作" title="更多笔记操作"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" portalContainer={fullscreenActive ? editorPortalContainer : undefined}>
          <DropdownMenuItem onSelect={() => switchReading(!reading)}>{reading ? <PenLine aria-hidden="true" /> : <BookOpen aria-hidden="true" />}{reading ? "切换到编辑" : "切换到阅读"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { flushDraft(); void save(); }}><SaveIcon aria-hidden="true" />立即保存</DropdownMenuItem>
          <DropdownMenuItem disabled={aiGenerated} onSelect={toggleAi}><Sparkles aria-hidden="true" />打开笔记 AI</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void toggleFullscreen()}>{fullscreenActive ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{fullscreenActive ? "退出专注" : "进入专注"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHistoryRequest(null)}><History aria-hidden="true" />对比与恢复历史版本</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyCurrentNoteReference()}><Link2 aria-hidden="true" />复制笔记引用</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyFullNote()}><Copy aria-hidden="true" />复制全文</DropdownMenuItem>
          <DropdownMenuItem disabled={isExporting} onSelect={startPdfExport}><Download aria-hidden="true" />{isExporting ? "正在生成 PDF…" : "导出 PDF"}</DropdownMenuItem>
          <DropdownMenuItem disabled={isChangingContentOrigin} onSelect={toggleContentOrigin}><Sparkles aria-hidden="true" />{aiGenerated ? "取消 AI 生成标记" : "标记为 AI 生成"}</DropdownMenuItem>
          {titleUndoStack.length ? <DropdownMenuItem onSelect={handleAiUndoTitle}>撤回 AI 标题</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <section data-note-editor-id={note.id} data-note-mode={reading ? "reading" : "editing"}
      ref={attachEditorSurface}
      className={`notes-editor-surface flex h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)] ${isFallbackFullscreen ? "fixed inset-0 z-[80] h-[var(--app-viewport-height)]" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="notes-editor-toolbar flex shrink-0 flex-col gap-0 border-b border-[var(--separator)] bg-[var(--surface-canvas)] px-5 py-1 md:px-8">
          <div className="notes-editor-title-row mx-auto flex min-h-10 w-full min-w-0 max-w-[720px] items-center gap-2">
            {aiGenerated ? <span title="AI 生成内容不会被 AI 读取为背景" className="shrink-0 text-[12px] text-[var(--accent)]"><Sparkles aria-label="AI 生成内容" className="size-4" /></span> : null}
            <NoteTitleMotion noteId={note.id} className="flex-1" editableTitle={title}><input
              aria-label="笔记标题"
              hidden={reading}
              readOnly={reading}
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                // 手动编辑标题后 AI 标题的撤回栈失效，避免撤回覆盖手动修改。
                titleUndoStackRef.current = [];
                setTitleUndoStack([]);
                setTitle(nextTitle);
                publishNotesNavigatorTitle(note.id, nextTitle);
                dirty(nextTitle, latestContentRef.current.body);
              }}
              className="notes-title-input w-full min-w-0 rounded-[var(--radius-sm)] bg-transparent py-1 font-[family-name:var(--font-serif)] text-[28px] font-normal leading-[1.4] tracking-[-0.015em] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:text-[32px]"
              placeholder="无标题笔记"
            />
            {reading ? <h1 className="notes-reading-title min-w-0 break-words py-1">{title || "无标题笔记"}</h1> : null}</NoteTitleMotion>
          </div>
          {(!headerActionsHost || fullscreenActive) ? headerActions : null}
        </div>
        {saveHasError ? (
          <div
            role={saveHasError ? "alert" : "status"}
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--separator)] bg-[var(--danger-soft)] px-3 py-[5px] text-[12px] leading-5 text-[var(--danger)]"
          >
            <span>{state === "保存失败"
              ? draftRecoveryUnavailable
                ? "保存失败，浏览器无法保留恢复草稿。请立即复制内容并检查网络。"
                : "保存失败，本标签页的恢复草稿已保留。请检查网络后点击保存。"
              : state === "版本冲突"
                ? "笔记发生版本冲突。已阻止覆盖云端内容，请对比两份版本并手动确认。"
                : statusLabel}</span>
            {state === "保存失败" ? <button type="button" onClick={() => { flushDraft(); void save(); }} className="pressable min-h-8 rounded-[6px] px-2 font-medium underline underline-offset-2">重试保存</button> : null}
            {saveHasError ? <button type="button" onClick={() => void copyFullNote()} className="pressable min-h-8 rounded-[6px] px-2 font-medium underline underline-offset-2">复制当前草稿</button> : null}
            {state === "版本冲突" ? <button type="button" onClick={() => { flushDraft(); setConflictSnapshot({ ...latestContentRef.current, baseRevision: revisionRef.current }); }} className="pressable min-h-8 rounded-[6px] px-2 font-medium underline underline-offset-2">对比并合并版本</button> : null}
          </div>
        ) : null}
        {draftRecoveryUnavailable ? (
          <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--separator)] bg-[var(--warning-soft)] px-3 py-2 text-[12px] text-[var(--warning)]">
            本机恢复草稿不可用，刷新或关闭标签页可能丢失未保存的内容。
            <button type="button" onClick={() => void copyFullNote()} className="pressable min-h-8 px-2 font-medium underline underline-offset-2">复制当前草稿</button>
          </div>
        ) : null}
        {/* Keep CodeMirror and its undo/selection/scroll state mounted in both views. */}
        <div hidden={reading} className="notes-document-body min-h-0 flex-1 overflow-hidden bg-[var(--surface-canvas)]">
          <VisualMarkdownEditor
            markdown={body}
            contentRevision={bodyRevision}
            noteId={note.id}
            onEditorReady={onEditorReady}
            onPositionIntent={interruptEditorRestore}
            onPositionChange={rememberPosition}
            onImageUploadStatus={handleImageUploadStatus}
            onOpenAi={aiGenerated ? undefined : openAi}
            onSelectionChange={setSelection}
            onChange={handleBodyChange}
          />
        </div>
        {reading ? <div className="notes-document-body min-h-0 flex-1 overflow-hidden"><NoteReadingView body={body} paneRef={readingPaneRef} onScroll={rememberReading} /></div> : null}
      </div>
      {headerActionsHost?.target && headerActionsHost.showEditorActions && !fullscreenActive ? createPortal(headerActions, headerActionsHost.target) : null}
      {(paneActive && !aiGenerated && (aiVisited || noteAiPanel.isOpen || selection)) ? <NoteAiAssistant
        key={note.id}
        open={aiGenerated ? false : noteAiPanel.isOpen}
        onOpen={openAi}
        onClose={noteAiPanel.close}
        noteId={note.id}
        title={title}
        bodyMarkdown={body}
        defaultModel={noteAiDefaultModel}
        loadPreferences={loadAiPreferences}
        selection={selection}
        onClearSelection={() => setSelection(null)}
        onReplaceNote={(suggestion) => {
          replaceBody(suggestion);
          dirty(title, suggestion);
        }}
        onReplaceTitle={handleAiReplaceTitle}
        onInsertNote={(suggestion) => {
          const nextBody = `${body}${body.trim() ? "\n\n" : ""}${suggestion}`;
          replaceBody(nextBody);
          dirty(title, nextBody);
        }}
      /> : null}
      {historyRequest !== undefined ? <NoteVersionHistory
        key={historyRequest ?? "history"}
        noteId={note.id}
        currentTitle={title}
        currentBody={body}
        initialVersionId={historyRequest}
        onApply={applyHistoricalDraft}
        onClose={() => setHistoryRequest(undefined)}
      /> : null}
      {conflictSnapshot ? <NoteConflictResolver
        noteId={note.id}
        localSnapshot={conflictSnapshot}
        onApply={applyConflictResolution}
        onClose={() => setConflictSnapshot(null)}
      /> : null}
      {pdfSnapshot ? (
        <article ref={pdfPreviewRef} className="note-pdf-export-preview fixed -left-[10000px] top-0 w-[794px] bg-[var(--surface-canvas)] p-12 text-[15px]">
          <h1 className="mb-7 text-3xl font-semibold text-[var(--text-primary)]">{pdfSnapshot.title}</h1>
          <MarkdownDocument body={pdfSnapshot.body} />
        </article>
      ) : null}
    </section>
  );
}
