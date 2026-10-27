"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./file-pdf-preview.css";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { noteSelectionContent } from "@/features/notes/selection-content";
import { sourceLocatorHref } from "@/features/links/source-locator";
import { acknowledgePositionRestore, type PdfPositionRequest, type PositionRestoreStatus } from "@/features/workbench/position-requests";
import { insertIntoAdjacentNote, listNoteInsertionTargets } from "@/features/workflow-continuity/note-insertion";
import { useWorkbenchActive } from "@/components/workbench/workbench-activity";
import { useReferenceNoteInsertion } from "@/components/workbench/reference-note-insertion";
import { useReadingVerificationTransport } from "@/features/files/reading-verification-context";
import { getReadingProgress, saveReadingProgress } from "@/features/files/reading-progress-actions";
import { createReadingProgressQueue, type ReadingProgress } from "@/features/files/reading-progress";
import type { OnProgressParameters, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "unpdf/pdfjs";

export const maxInlinePdfBytes = 25 * 1024 * 1024;
export const maxInlinePdfPages = 500;
export const maxPdfCanvasPixels = 4_000_000;
export const pdfLoadTimeoutMs = 30_000;
export const pdfRenderTimeoutMs = 20_000;
const fallbackMessage = "PDF 预览暂不可用，可在新窗口打开或下载原件。";
const buttonClass = "inline-flex min-h-11 min-w-11 md:min-h-9 md:min-w-0 items-center justify-center rounded-md px-2 text-[12px] hover:bg-[var(--surface-control)] disabled:cursor-default disabled:opacity-40";

function preflightMessage(status: number) {
  if (status === 401 || status === 403) return "请重新登录后预览。";
  if (status === 404) return "文件已不可用或已归档，请刷新后检查。";
  if (status === 415 || status === 422) return "此文件暂时无法作为 PDF 预览，可下载原件查看。";
  return fallbackMessage;
}

/** A keyed session prevents old document loads from painting a newer selection. */
type PdfPreviewProps = { documentId: string; title: string; embedded?: boolean; active?: boolean; persistProgress?: boolean; initialPage?: number; initialSourceVersion?: string; onPageChange?: (page: number, sourceVersion: string | null) => void; onReferenceInsertionHandoff?: () => void };
export function FilePdfPreview(props: PdfPreviewProps) {
  const paneActive = useWorkbenchActive();
  const [resume, setResume] = useState(() => ({ id: props.documentId, page: props.initialPage, source: props.initialSourceVersion }));
  const active = paneActive && (props.active ?? true);
  const remember = (page: number, source: string | null) => {
    setResume({ id: props.documentId, page, source: source ?? undefined });
    props.onPageChange?.(page, source);
  };
  const current = resume.id === props.documentId ? resume : { id: props.documentId, page: props.initialPage, source: props.initialSourceVersion };
  const page = current.page && Number.isInteger(current.page) && current.page >= 1 && current.page <= maxInlinePdfPages ? current.page : undefined;
  // The boxless wrapper retains only this document's numeric reading metadata.
  // The heavy session/proxy still fully unmounts while its pane is inactive.
  return <div className="contents" data-pdf-document-id={current.id} data-pdf-source-version={current.source} data-pdf-page={page}>
    {active ? <PdfPreviewSession key={props.documentId} {...props} active initialPage={current.page} initialSourceVersion={current.source} onPageChange={remember} /> : <p className="p-4 text-sm text-[var(--text-secondary)]">返回此区域后继续阅读 PDF。</p>}
  </div>;
}

function PdfPreviewSession({ documentId, title, embedded = false, active: paneActive = true, persistProgress = true, initialPage: restoredPage, initialSourceVersion, onPageChange, onReferenceInsertionHandoff }: PdfPreviewProps) {
  const readingTransport=useReadingVerificationTransport();
  const [originScope] = useState(captureWorkspaceScope);
  const restoreRequest = useRef<{ request: PdfPositionRequest; page: number; status: Exclude<PositionRestoreStatus, "timeout"> } | null>(null);
  const url = `/api/files/${documentId}/preview`;
  const [initialRestore] = useState(() => ({ page: restoredPage, source: initialSourceVersion }));
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [pageNumber, setPageNumber] = useState(restoredPage ?? 1);
  const resumePage = useRef(1);
  const previousSource = useRef<string | null>(null);
  const [sourceVersion, setSourceVersion] = useState<string | null>(null);
  const onPageRef = useRef(onPageChange);
  useEffect(() => { onPageRef.current = onPageChange; }, [onPageChange]);
  const [readingMessage, setReadingMessage] = useState("");
  const [conflict, setConflict] = useState<ReadingProgress | null>(null);
  const progressQueue = useRef<ReturnType<typeof createReadingProgressQueue> | null>(null);
  const initialPage = useRef(1);
  const userNavigated = useRef(false);
  const onRendered = useCallback((page: number) => {
    resumePage.current = page;
    onPageRef.current?.(page, previousSource.current);
    if (persistProgress && userNavigated.current) progressQueue.current?.record(page);
    const restore = restoreRequest.current;
    if (restore && restore.page === page && originScope()) {
      restoreRequest.current = null;
      acknowledgePositionRestore(restore.request, restore.status);
    }
  }, [persistProgress, originScope]);
  const navigate = (page: number) => {
    if (restoreRequest.current) acknowledgePositionRestore(restoreRequest.current.request, "cancelled");
    restoreRequest.current = null; userNavigated.current = true; setPageNumber(page);
  };
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(640);
  const container = useRef<HTMLDivElement>(null);
  const loadingTask = useRef<PDFDocumentLoadingTask | null>(null);
  const destroy = useCallback(() => {
    const task = loadingTask.current;
    loadingTask.current = null;
    if (task) void task.destroy().catch(() => {});
  }, []);
  const fail = useCallback((message: string) => {
    setError(message);
    setPdf(null);
    destroy();
  }, [destroy]);

  useEffect(() => {
    if (!paneActive) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      fail("PDF 加载超时，可在新窗口打开或下载原件。");
    }, pdfLoadTimeoutMs);
    void (async () => {
      try {
        const response = await fetch(url, { method: "HEAD", credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!active) return;
        if (!response.ok) { fail(preflightMessage(response.status)); return; }
        setNativeAvailable(true);
        const sourceVersion = response.headers.get("X-Reading-Source-Version");
        if (!sourceVersion || previousSource.current !== sourceVersion) {
          resumePage.current = sourceVersion && sourceVersion === initialRestore.source ? initialRestore.page ?? 1 : 1;
        }
        if (initialRestore.page && initialRestore.page > 1 && sourceVersion !== initialRestore.source) setReadingMessage("原文件版本已变化，已从第一页开始");
        previousSource.current = sourceVersion;
        setSourceVersion(sourceVersion);
        const size = Number(response.headers.get("content-length"));
        if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf" ||
            !Number.isSafeInteger(size) || size < 8) { fail(fallbackMessage); return; }
        if (size > maxInlinePdfBytes) { fail("文件超过 25 MiB 页内预览上限，可在新窗口打开或下载原件。"); return; }
        // Browser-only lazy import. This installed bundle includes its worker;
        // no CDN, public URL, iframe, PDF scripting or annotation layer is used.
        const { getDocument } = await import("unpdf/pdfjs");
        if (!active) return;
        const options = {
          url, ...(sourceVersion ? { httpHeaders: { "X-Reading-Source-Version": sourceVersion } } : {}), withCredentials: true, disableStream: true, disableAutoFetch: true, rangeChunkSize: 65_536,
          useSystemFonts: true, enableXfa: false, maxImageSize: maxPdfCanvasPixels,
          canvasMaxAreaInBytes: maxPdfCanvasPixels * 4, useWorkerFetch: false, useWasm: false,
          isImageDecoderSupported: false, stopAtErrors: true, verbosity: 0,
        } satisfies NonNullable<Parameters<typeof getDocument>[0]>;
        const task = getDocument(options);
        loadingTask.current = task;
        task.onProgress = ({ loaded, total }: OnProgressParameters) => {
          if (active && (loaded > maxInlinePdfBytes || total > maxInlinePdfBytes)) {
            active = false;
            clearTimeout(timer);
            fail("文件超过 25 MiB 页内预览上限，可在新窗口打开或下载原件。");
          }
        };
        const document = await task.promise;
        if (!active) return;
        if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > maxInlinePdfPages) {
          fail("此 PDF 页数超出页内预览范围，可在新窗口打开或下载原件。");
          return;
        }
        // Old deployments remain readable without pretending progress was saved.
        const snapshot = persistProgress && sourceVersion ? await (readingTransport?.read??getReadingProgress)(documentId).catch(() => null) : null;
        if (!active) return;
        if (snapshot && snapshot.sourceVersion === sourceVersion &&
            (!snapshot.progress || snapshot.progress.totalPages === document.numPages)) {
          const saved = snapshot.progress;
          initialPage.current = Math.min(document.numPages, resumePage.current > 1 ? resumePage.current : saved?.page ?? 1);
          setPageNumber(initialPage.current);
          if (saved && saved.page > 1) setReadingMessage(`已接续第 ${saved.page} 页`);
          progressQueue.current = createReadingProgressQueue({
            documentId, sourceVersion, totalPages: document.numPages, revision: saved?.revision ?? 0,
            save: readingTransport?.save??saveReadingProgress,
            report(result) {
              if (!active) return;
              if (result.status === "saved") setReadingMessage("阅读进度已同步");
              else if (result.status === "conflict") { setConflict(result.progress); setReadingMessage(`另一设备已更新到第 ${result.progress.page} 页`); }
              else setReadingMessage(result.status === "source_changed" ? "原文件已变化，请重新打开后继续" : "阅读进度暂未同步，请重新打开后重试");
            },
          });
        } else {
          setPageNumber(Math.min(document.numPages, resumePage.current));
          if (persistProgress) setReadingMessage("阅读进度暂不可用；本次仍可阅读");
        }
        setError("");
        setPdf(document);
      } catch (error) {
        if (active) fail(error instanceof Error && error.name === "PasswordException"
          ? "此 PDF 需要密码，请在新窗口打开或下载原件查看。" : fallbackMessage);
      } finally { clearTimeout(timer); }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      destroy();
    };
  }, [url, documentId, destroy, fail, paneActive, persistProgress, initialRestore, readingTransport]);

  useEffect(() => {
    const restore = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.documentId !== documentId || !pdf || !originScope() || !paneActive) return;
      const request = event.detail as PdfPositionRequest;
      if (restoreRequest.current) acknowledgePositionRestore(restoreRequest.current.request, "cancelled");
      if (!sourceVersion) { acknowledgePositionRestore(request, "unavailable"); return; }
      const changed = request.sourceVersion !== sourceVersion;
      const page = changed ? 1 : request.page;
      if (!Number.isInteger(page) || page < 1 || page > pdf.numPages) { acknowledgePositionRestore(request, "missing"); return; }
      if (changed) setReadingMessage("原文件版本已变化，已从第一页开始");
      userNavigated.current = false; resumePage.current = page;
      const status = changed ? "changed-source" : "applied";
      const rendered = container.current?.querySelector<HTMLCanvasElement>('canvas[data-pdf-rendered="true"]');
      if (Number(rendered?.dataset.pdfPage) === page) acknowledgePositionRestore(request, status);
      else restoreRequest.current = { request, page, status };
      setPageNumber(page);
    };
    window.addEventListener("personal-os:restore-pdf-position", restore);
    return () => { window.removeEventListener("personal-os:restore-pdf-position", restore); if (restoreRequest.current) acknowledgePositionRestore(restoreRequest.current.request, "cancelled"); restoreRequest.current = null; };
  }, [documentId, pdf, sourceVersion, originScope, paneActive]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const measured = Math.floor(element.getBoundingClientRect().width - 24);
      if (measured > 0) setWidth(Math.max(160, Math.min(1600, measured)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!paneActive) return <p className="p-4 text-sm text-[var(--text-secondary)]">返回此区域后继续阅读 PDF。</p>;
  return <div data-pdf-document-id={documentId} data-pdf-source-version={sourceVersion ?? undefined} data-embedded={embedded || undefined} className={`file-pdf-preview min-w-0 ${embedded ? "" : "space-y-2"}`}>
    <div className="file-pdf-controls flex flex-wrap items-center gap-1 text-[12px]" aria-label="PDF 阅读控制">
      <button type="button" className={buttonClass} disabled={!pdf || pageNumber <= 1} onClick={() => navigate(Math.max(1, pageNumber - 1))}>上一页</button>
      <span className="file-pdf-page-count px-1 tabular-nums" aria-live="polite">{pdf ? `第 ${pageNumber} / ${pdf.numPages} 页` : "正在读取页码"}</span>
      <button type="button" className={buttonClass} disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => pdf && navigate(Math.min(pdf.numPages, pageNumber + 1))}>下一页</button>
      <span className="flex-1" />
      <button type="button" className={buttonClass} aria-label="缩小 PDF" disabled={!pdf || zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
      <button type="button" className={buttonClass} disabled={!pdf} onClick={() => setZoom(1)}>适合宽度</button>
      <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
      <button type="button" className={buttonClass} aria-label="放大 PDF" disabled={!pdf || zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}>+</button>
    </div>
    {pdf && readingMessage ? <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-[var(--text-secondary)]" role="status">
      <span>{readingMessage}</span>
      {conflict ? <>
        <button type="button" className={buttonClass} onClick={() => {
          progressQueue.current?.resolve(conflict.revision); userNavigated.current = false;
          setPageNumber(Math.min(pdf.numPages, conflict.page)); setConflict(null); setReadingMessage("已接续另一设备的进度");
        }}>接续最新进度</button>
        <button type="button" className={buttonClass} onClick={() => {
          progressQueue.current?.resolve(conflict.revision); progressQueue.current?.record(pageNumber);
          setConflict(null); setReadingMessage("正在同步阅读进度…");
        }}>以本页继续</button>
      </> : pageNumber > 1 ? <button type="button" className={buttonClass} onClick={() => navigate(1)}>从头阅读</button> : null}
    </div> : null}
    <div ref={container} className="file-pdf-viewport max-h-[60dvh] min-h-64 overflow-auto rounded-[10px] border border-[var(--separator)] bg-[var(--surface-control)] p-3">
      {error ? <p role="alert" className="text-[12px] leading-5">{error}</p> : pdf ?
        <PdfCanvasPage key={`${pageNumber}:${zoom}:${width}`} pdf={pdf} pageNumber={pageNumber} title={title} documentId={documentId} sourceVersion={sourceVersion} width={width * zoom} onFailure={fail} onRendered={onRendered} onReferenceInsertionHandoff={onReferenceInsertionHandoff} /> :
        <div className="file-pdf-paper-placeholder"><p role="status" className="flex min-h-56 items-center justify-center text-[13px] text-[var(--text-secondary)]">正在准备 PDF 预览…</p></div>}
    </div>
    <p className="text-[12px] leading-5 text-[var(--text-secondary)]">逐页显示 PDF；页内预览上限为 25 MiB。文件通过当前登录会话读取，不会发送给第三方阅读服务。</p>
    <div className="flex flex-wrap gap-x-4 text-[12px] text-[var(--accent)]">
      {nativeAvailable ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center">在新窗口预览 PDF</a> : null}
      <a href={`/api/files/${documentId}/download`} className="inline-flex min-h-9 items-center">下载原件</a>
    </div>
  </div>;
}

export function PdfCanvasPage({ pdf, pageNumber, title, documentId, sourceVersion, width, onFailure, onRendered, onReferenceInsertionHandoff }: {
  pdf: PDFDocumentProxy; pageNumber: number; title: string; documentId?: string; sourceVersion?: string | null; width: number; onFailure: (message: string) => void; onRendered: (page: number) => void; onReferenceInsertionHandoff?: () => void;
}) {
  const referenceInsertion = useReferenceNoteInsertion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // The page never renews its originating owner/Vault lease on a later click.
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const origin = useMemo(() => ({ pdf, documentId, sourceVersion, pageNumber, width, onFailure, onRendered }), [pdf, documentId, sourceVersion, pageNumber, width, onFailure, onRendered]);
  type PageSelection = { text: string; origin: typeof origin; generation: number };
  const generationRef = useRef(0);
  const renderedOrigin = useRef<typeof origin | null>(null);
  const selectionRef = useRef<PageSelection | null>(null);
  const [selection, setSelection] = useState<PageSelection | null>(null);
  const selectedText = selection?.origin === origin ? selection.text : "";
  const [textStatus, setTextStatus] = useState("");
  const [insertionMessage, setInsertionMessage] = useState("");
  const [targets, setTargets] = useState<ReturnType<typeof listNoteInsertionTargets>>([]);
  const [targetNoteId, setTargetNoteId] = useState("");
  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    setSelection(null); setTargetNoteId(""); setTargets([]); setInsertionMessage("");
  }, []);
  useEffect(() => {
    const invalidate = () => {
      renderedOrigin.current = null;
      clearSelection(); setTextStatus("");
      setInsertionMessage("工作区已变化，请重新打开 PDF 后选择文字。");
    };
    const unregister = registerWorkspaceScopeCleanup(invalidate);
    const select = () => {
      if (!scopeIsCurrent()) { invalidate(); return; }
      if (renderedOrigin.current !== origin) return;
      const range = window.getSelection(), layer = textRef.current;
      const valid = layer && range?.rangeCount && layer.contains(range.anchorNode) && layer.contains(range.focusNode);
      const text = valid ? range!.toString().trim() : "";
      if (text) {
        const selected = text.length <= 10_000 ? { text, origin, generation: generationRef.current } : null;
        selectionRef.current = selected; setSelection(selected);
        setTargets(listNoteInsertionTargets());
      }
    };
    document.addEventListener("selectionchange", select);
    return () => {
      unregister(); document.removeEventListener("selectionchange", select);
      selectionRef.current = null; renderedOrigin.current = null;
    };
  }, [origin, scopeIsCurrent, clearSelection]);
  const [rendered, setRendered] = useState(false);
  const [previousOrigin, setPreviousOrigin] = useState(origin);
  // Reset page-local UI with the changed input, before committing controls for
  // the next page. Effect cleanup separately revokes already-queued callbacks.
  if (previousOrigin !== origin) {
    setPreviousOrigin(origin); setSelection(null); setTargetNoteId(""); setTargets([]);
    setInsertionMessage(""); setTextStatus(""); setRendered(false);
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scopeIsCurrent()) return;
    const generation = ++generationRef.current;
    renderedOrigin.current = null;
    selectionRef.current = null;
    let active = true;
    let released = false;
    let page: PDFPageProxy | undefined;
    let render: RenderTask | undefined;
    let textLayer: import("unpdf/pdfjs").TextLayer | undefined;
    const textContainer = textRef.current;
    const release = () => {
      if (released) return;
      released = true;
      render?.cancel();
      textLayer?.cancel();
      if (textContainer) textContainer.replaceChildren();
      const settled = render ? render.promise.catch(() => {}) : Promise.resolve();
      void settled.then(() => {
        page?.cleanup();
        if (canvasRef.current !== canvas || generationRef.current === generation) {
          canvas.width = 0;
          canvas.height = 0;
        }
      });
    };
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      release();
      onFailure("这一页渲染超时，可在新窗口打开或下载原件。");
    }, pdfRenderTimeoutMs);
    const unregisterScope = registerWorkspaceScopeCleanup(() => {
      active = false; clearTimeout(timer); release();
    });
    void (async () => {
      try {
        page = await pdf.getPage(pageNumber);
        if (!active) { page.cleanup(); return; }
        const base = page.getViewport({ scale: 1 });
        if (![base.width, base.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("invalid_page_size");
        const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const cssScale = Math.min(width / base.width, 4096 / base.width, 4096 / base.height);
        const scale = Math.min(cssScale * ratio, Math.sqrt(maxPdfCanvasPixels / (base.width * base.height)), 4096 / base.width, 4096 / base.height);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        if (canvas.width * canvas.height > maxPdfCanvasPixels) throw new Error("canvas_too_large");
        canvas.style.width = `${base.width * cssScale}px`;
        canvas.style.height = `${base.height * cssScale}px`;
        canvas.parentElement?.style.setProperty("--pdf-page-ratio", String(base.width / base.height));
        canvas.parentElement?.parentElement?.style.setProperty("--pdf-page-ratio", String(base.width / base.height));
        canvas.parentElement?.parentElement?.style.setProperty("--pdf-page-width", `${base.width * cssScale}px`);
        canvas.parentElement?.style.setProperty("--pdf-page-width", `${base.width * cssScale}px`);
        if (!canvas.getContext("2d")) throw new Error("canvas_unavailable");
        render = page.render({ canvas, viewport, annotationMode: 0, background: "rgb(255,255,255)" });
        await render.promise;
        if (!active) return;
        // The success marker is evidence of an actual completed canvas render,
        // never a successful HEAD request or a native iframe load event.
        canvas.dataset.pdfRendered = "true";
        setRendered(true);
        onRendered(pageNumber);
        if (textContainer) {
          try {
          const content = await page.getTextContent();
          if (!active) return;
          const characters = content.items.reduce((count, item) => count + ("str" in item ? item.str.length : 0), 0);
          if (content.items.length > 20_000 || characters > 200_000) { setTextStatus("这一页文字量超出选择范围，可下载原件阅读。"); return; }
          if (!characters) { setTextStatus("此页没有可选文字，可关闭预览后使用文件 OCR。"); return; }
          const { TextLayer } = await import("unpdf/pdfjs");
          if (!active) return;
          textContainer.style.setProperty("--total-scale-factor", String(cssScale));
          textLayer = new TextLayer({ textContentSource: content, container: textContainer, viewport: page.getViewport({ scale: cssScale }) });
          await textLayer.render();
          if (active && scopeIsCurrent()) { renderedOrigin.current = origin; setTextStatus("可选择文字，摘录到旁边笔记。"); }
          } catch { if (active) setTextStatus("这一页文字暂不可选择，仍可阅读或下载原件。"); }
        }
      } catch {
        if (active) onFailure(fallbackMessage);
      } finally { clearTimeout(timer); }
    })();
    return () => { unregisterScope(); active = false; clearTimeout(timer); release(); };
  }, [pdf, pageNumber, width, onFailure, onRendered, origin, scopeIsCurrent]);
  const selectionSource = selectedText && documentId && sourceVersion ? { kind: "pdf" as const, href: sourceLocatorHref({ kind: "pdf", documentId, sourceVersion, page: pageNumber }), page: pageNumber } : null;
  const selectedQuote = selectionSource ? noteSelectionContent(selectedText, selectionSource) : null;
  // Capture the selection record, not a fresh scope at dispatch time. Even a
  // queued old callback must fail before handing private content to a target.
  const selectionIsCurrent = () => scopeIsCurrent() && selection !== null && selectionRef.current === selection &&
    selection.origin === origin && renderedOrigin.current === origin &&
    selection.generation === generationRef.current && !!canvasRef.current?.isConnected;
  const insertSelection = async (referenceOnly: boolean) => {
    if (!selectionIsCurrent()) {
      if (!scopeIsCurrent()) {
        clearSelection(); setInsertionMessage("工作区已变化，请重新打开 PDF 后选择文字。");
      }
      return;
    }
    if (!selectionSource) return;
    const content = noteSelectionContent(selectedText, selectionSource, referenceOnly);
    if (content.status === "over-budget") { setInsertionMessage(`引用格式与来源链接合计 ${content.actual.toLocaleString("en-US")} 个字符，超过单次笔记插入的 ${content.limit.toLocaleString("en-US")} 字符上限。请缩小选区或仅关联本页来源。`); return; }
    if (referenceInsertion?.noteId === targetNoteId && !targets.some(target => target.noteId === targetNoteId)) {
      const accepted = referenceInsertion.stage({ noteId: targetNoteId, markdown: content.content, sourceHref: selectionSource.href, beforeActivate: onReferenceInsertionHandoff });
      if (!accepted && selectionIsCurrent()) setInsertionMessage("参考笔记已变化，请重新选择摘录目标。");
      return;
    }
    const result = await insertIntoAdjacentNote({ targetNoteId, markdown: content.content });
    if (!selectionIsCurrent()) return;
    setInsertionMessage(result.status === "applied" ? "已插入，等待笔记自动保存。"
      : result.status === "too-large" ? `本次插入超过 ${result.limit.toLocaleString("en-US")} 字符上限，请缩小选区或仅关联本页来源。`
      : result.status === "inactive" ? "目标笔记不可编辑，请重新打开后选择。"
      : result.status === "conflict" ? "目标笔记内容或可插入空间已变化，请缩小选区或选择另一篇笔记。"
      : "来源或目标状态已变化，请重新选择文字后重试。");
  };
  return <><div className="flex flex-wrap items-center gap-2 py-2 text-xs" role="status">{textStatus}
    {selectedText && documentId && sourceVersion ? <>
      <label>目标笔记<select aria-label="摘录目标笔记" value={targetNoteId} onChange={(event) => { if (selectionIsCurrent()) setTargetNoteId(event.target.value); }} className="ui-field ml-2 min-h-11"><option value="">选择旁边已打开的笔记</option>{targets.map((target) => <option key={`${target.role}:${target.noteId}`} value={target.noteId}>{target.label || (target.role === "reference" ? "参照笔记" : "当前笔记")}</option>)}{referenceInsertion && !targets.some(target => target.noteId === referenceInsertion.noteId) ? <option value={referenceInsertion.noteId}>参考笔记（切换后确认）</option> : null}</select></label>
      <button type="button" onClick={() => { if (selectionIsCurrent()) clearSelection(); }} className="min-h-11 px-2">取消选文</button>
      {selectedQuote?.status === "over-budget" ? <p role="status" className="basis-full">引用格式与来源链接合计 {selectedQuote.actual.toLocaleString("en-US")} 个字符，超过单次笔记插入的 {selectedQuote.limit.toLocaleString("en-US")} 字符上限。原选文与页码来源已保留，请缩小选区或仅关联本页来源。</p> : null}
      <button type="button" disabled={!targetNoteId || selectedQuote?.status !== "ready"} onMouseDown={(event) => event.preventDefault()} onClick={() => void insertSelection(false)} className="min-h-11 rounded-md border px-3 disabled:opacity-40">{referenceInsertion?.noteId === targetNoteId && !targets.some(target => target.noteId === targetNoteId) ? "到参考笔记确认摘录" : "摘录到笔记"}</button>
      <button type="button" disabled={!targetNoteId} onMouseDown={(event) => event.preventDefault()} onClick={() => void insertSelection(true)} className="min-h-11 rounded-md border px-3 disabled:opacity-40">仅关联本页来源</button>
    </> : null}{scopeIsCurrent() ? insertionMessage : "工作区已变化，请重新打开 PDF 后选择文字。"}</div><div className="file-pdf-page" data-rendered={rendered || undefined}>
    {!rendered ? <p role="status" className="file-pdf-drawing-status py-3 text-[12px] text-[var(--text-secondary)]">正在绘制第 {pageNumber} 页…</p> : null}
    <div className="file-pdf-text-page relative mx-auto" style={{ width: "var(--pdf-page-width)" }}><canvas ref={canvasRef} role="img" aria-label={`${title}，第 ${pageNumber} 页`} data-pdf-page={pageNumber}
      className="mx-auto block bg-[var(--surface-canvas)] shadow-sm" style={{ visibility: rendered ? "visible" : "hidden" }} /><div ref={textRef} className="file-pdf-text-layer" aria-label={`第 ${pageNumber} 页可选文字`} /></div>
  </div></>;
}
