import { z } from "zod";
import type { WorkbenchPosition } from "@/features/workbench/contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { noteDocumentCache } from "@/features/notes/document-resource";
import { requestPositionRestore, type PositionRestoreStatus } from "@/features/workbench/position-requests";
type ScrollScope = "main" | "reference";
function paneScroller(container: HTMLElement) {
  const candidates = container.querySelectorAll<HTMLElement>(".note-reading-pane,.cm-scroller,.workspace-scroll,.workbench-document,[data-workspace-scroll],[data-pdf-document-id] .overflow-auto");
  return [...candidates].find((node) => node.clientHeight > 0 && (node.scrollHeight > node.clientHeight || /auto|scroll/.test(getComputedStyle(node).overflowY))) ?? null;
}
/** Capture the actual scroll owner. Ordinary pages scroll the document; reference panes never do. */
export async function captureWorkbenchPosition(container: HTMLElement | null, scope: ScrollScope = "reference"): Promise<WorkbenchPosition> {
  if (!container) return {};
  const scroller = paneScroller(container);
  const owner = scope === "main" && !scroller ? "document" : "pane";
  const pdf = container.querySelector<HTMLCanvasElement>('canvas[data-pdf-rendered="true"][data-pdf-page]');
  const pdfContainer = container.querySelector<HTMLElement>("[data-pdf-document-id]");
  const sourceVersion = pdfContainer?.dataset.pdfSourceVersion;
  const documentId = pdfContainer?.dataset.pdfDocumentId;
  const readerView = container.querySelector<HTMLElement>("[data-note-reader-view]")?.dataset.noteReaderView;
  const pdfPage = Number(pdf?.dataset.pdfPage ?? pdfContainer?.dataset.pdfPage);
  const currentPdf = readerView !== "markdown";
  const hiddenDocumentScroll = container.hidden ? Number(container.dataset.workbenchDocumentScroll) : NaN;
  const result: WorkbenchPosition = {
    scrollOwner: owner, scrollTop: owner === "document" ? Number.isFinite(hiddenDocumentScroll) ? hiddenDocumentScroll : document.scrollingElement?.scrollTop || window.scrollY : (scroller ?? container).scrollTop,
    ...(currentPdf && z.uuid().safeParse(sourceVersion).success ? { pdfSourceVersion: sourceVersion } : {}),
    ...(currentPdf && z.uuid().safeParse(documentId).success ? { pdfDocumentId: documentId } : {}),
    ...(readerView === "pdf" || readerView === "markdown" ? { noteReaderView: readerView } : {}),
    ...(currentPdf && Number.isInteger(pdfPage) && pdfPage >= 1 && pdfPage <= 500 ? { pdfPage } : {}),
  };
  const editor = container.querySelector<HTMLElement>(".cm-editor");
  if (editor && editor.getBoundingClientRect().height > 0 && readerView !== "pdf") {
    const { EditorView } = await import("@codemirror/view");
    const view = EditorView.findFromDOM(editor);
    if (view) {
      const { captureEditorPosition } = await import("@/features/notes/editor/continuity");
      const position = captureEditorPosition(view);
      return { ...result, anchor: position.anchor, head: position.head, sourceLine: position.viewport.line, sourceOffset: position.viewport.offset, reading: false };
    }
  }
  const reader = container.querySelector<HTMLElement>(".note-reading-pane");
  if (reader && reader.getBoundingClientRect().height > 0 && readerView !== "pdf") {
    const { captureReadingAnchor } = await import("@/features/notes/editor/continuity");
    const position = captureReadingAnchor(reader);
    return { ...result, sourceLine: position.line, sourceOffset: position.offset, reading: true };
  }
  // A mobile-hidden editor has no measurable geometry. Its existing continuity
  // holds numeric anchors without reading or persisting its private body.
  const noteId = container.querySelector<HTMLElement>("[data-note-editor-id]")?.dataset.noteEditorId;
  const continuity = noteId ? noteDocumentCache.position(noteId) : undefined;
  if (continuity && readerView !== "pdf") {
    const viewport = continuity.reading ? continuity.reader : continuity.editor?.viewport;
    return { ...result, reading: continuity.reading, ...(viewport ? { sourceLine: viewport.line, sourceOffset: viewport.offset } : {}), ...(continuity.editor ? { anchor: continuity.editor.anchor, head: continuity.editor.head } : {}) };
  }
  return result;
}
/** One bounded restore attempt. Success, cancellation and timeout all consume the request. */
export function restoreWorkbenchPosition(container: HTMLElement, position: WorkbenchPosition, options: { scope?: ScrollScope; onSettled?: (restored: boolean, status?: PositionRestoreStatus) => void } = {}) {
  const scopeCurrent = captureWorkspaceScope();
  const controller = new AbortController();
  let cancelled = false; let settled = false; let applying = false; let noteViewRequested = false;
  const settle = (restored: boolean, status: PositionRestoreStatus = restored ? "applied" : "unavailable") => {
    if (settled) return;
    settled = true; observer.disconnect(); clearInterval(timer);
    document.removeEventListener("wheel", interrupt, true); document.removeEventListener("pointerdown", interrupt, true); document.removeEventListener("beforeinput", interrupt, true); document.removeEventListener("scroll", interruptedScroll, true); document.removeEventListener("keydown", interruptedKey, true);
    controller.abort(); options.onSettled?.(restored, status);
  };
  const interrupt = () => { cancelled = true; settle(false, "cancelled"); };
  const interruptedScroll = () => { if (!applying) interrupt(); };
  const interruptedKey = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) interrupt(); };
  const restore = async () => {
    if (cancelled || settled || !scopeCurrent() || applying) return;
    if (!container.isConnected) { settle(false); return; }
    const shell = container.querySelector<HTMLElement>("[data-note-document-id]");
    if (shell && !noteViewRequested && (position.noteReaderView || position.pdfPage || position.anchor !== undefined || position.reading !== undefined)) {
      noteViewRequested = true;
      window.dispatchEvent(new CustomEvent("personal-os:restore-note-reader", { detail: { noteId: shell.dataset.noteDocumentId, view: position.noteReaderView ?? (position.pdfPage ? "pdf" : "markdown"), documentId: position.pdfDocumentId } }));
    }
    const wantsPdf = position.noteReaderView === "pdf" || position.pdfPage !== undefined;
    const pdfReady = container.querySelector('canvas[data-pdf-rendered="true"]');
    const editor = container.querySelector<HTMLElement>(".cm-editor");
    const reader = container.querySelector<HTMLElement>(".note-reading-pane");
    if (wantsPdf && !pdfReady) return;
    if (!wantsPdf && (position.anchor !== undefined || position.reading !== undefined) && !editor && !reader) return;
    if (!editor && !reader && !pdfReady && container.querySelector('[role="status"],[aria-busy="true"]')) return;
    applying = true;
    try {
      const note = container.querySelector<HTMLElement>("[data-note-editor-id]");
      if (!wantsPdf && note && (position.anchor !== undefined || position.reading !== undefined)) {
        const instanceId = crypto.randomUUID(); note.dataset.positionRestoreId = instanceId;
        const result = await requestPositionRestore("note", { noteId: note.dataset.noteEditorId ?? "", instanceId, position }, controller.signal);
        if (note.dataset.positionRestoreId === instanceId) delete note.dataset.positionRestoreId;
        if (!cancelled && scopeCurrent()) settle(result === "applied", result);
        return;
      }
      if (position.pdfPage !== undefined) {
        const result = await requestPositionRestore("pdf", { documentId: position.pdfDocumentId ?? container.querySelector<HTMLElement>("[data-pdf-document-id]")?.dataset.pdfDocumentId ?? "", page: position.pdfPage, sourceVersion: position.pdfSourceVersion }, controller.signal);
        if (cancelled || !scopeCurrent()) return;
        if (result !== "applied") { settle(false, result); return; }
      }
      if (reader && position.sourceLine && !wantsPdf) {
        const { restoreReadingAnchor } = await import("@/features/notes/editor/continuity");
        if (!cancelled && scopeCurrent()) restoreReadingAnchor(reader, { line: position.sourceLine, offset: position.sourceOffset ?? 0 });
      } else if ((options.scope === "main" || position.scrollOwner === "document") && position.scrollOwner !== "pane") {
        window.scrollTo({ top: position.scrollTop ?? 0, behavior: "instant" });
      } else (paneScroller(container) ?? container.querySelector<HTMLElement>(".workbench-document") ?? container).scrollTop = position.scrollTop ?? 0;
      if (!cancelled && scopeCurrent()) settle(true);
    } catch { settle(false); }
  };
  const observer = new MutationObserver(() => void restore());
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-pdf-rendered", "aria-busy"] });
  const deadline = Date.now() + 10_000;
  const timer = setInterval(() => { if (Date.now() > deadline || !scopeCurrent()) settle(false); else void restore(); }, 150);
  document.addEventListener("wheel", interrupt, { passive: true, capture: true }); document.addEventListener("pointerdown", interrupt, true); document.addEventListener("beforeinput", interrupt, true); document.addEventListener("scroll", interruptedScroll, true); document.addEventListener("keydown", interruptedKey, true);
  void restore();
  return () => { cancelled = true; settle(false, "cancelled"); };
}
