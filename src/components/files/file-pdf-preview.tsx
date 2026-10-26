"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./file-pdf-preview.css";
import { useWorkbenchActive } from "@/components/workbench/workbench-activity";
import { getReadingProgress, saveReadingProgress } from "@/features/files/reading-progress-actions";
import { createReadingProgressQueue, type ReadingProgress } from "@/features/files/reading-progress";
import type { OnProgressParameters, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "unpdf/pdfjs";

export const maxInlinePdfBytes = 25 * 1024 * 1024;
export const maxInlinePdfPages = 500;
export const maxPdfCanvasPixels = 4_000_000;
export const pdfLoadTimeoutMs = 30_000;
export const pdfRenderTimeoutMs = 20_000;
const fallbackMessage = "PDF 预览暂不可用，可在新窗口打开或下载原件。";
const buttonClass = "inline-flex min-h-9 items-center justify-center rounded-md px-2 text-[12px] hover:bg-[var(--surface-control)] disabled:cursor-default disabled:opacity-40";

function preflightMessage(status: number) {
  if (status === 401 || status === 403) return "请重新登录后预览。";
  if (status === 404) return "文件已不可用或已归档，请刷新后检查。";
  if (status === 415 || status === 422) return "此文件暂时无法作为 PDF 预览，可下载原件查看。";
  return fallbackMessage;
}

/** A keyed session prevents old document loads from painting a newer selection. */
type PdfPreviewProps = { documentId: string; title: string; embedded?: boolean; active?: boolean; persistProgress?: boolean; initialPage?: number; initialSourceVersion?: string; onPageChange?: (page: number, sourceVersion: string | null) => void };
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

function PdfPreviewSession({ documentId, title, embedded = false, active: paneActive = true, persistProgress = true, initialPage: restoredPage, initialSourceVersion, onPageChange }: PdfPreviewProps) {
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
  }, [persistProgress]);
  const navigate = (page: number) => { userNavigated.current = true; setPageNumber(page); };
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
        const snapshot = persistProgress && sourceVersion ? await getReadingProgress(documentId).catch(() => null) : null;
        if (!active) return;
        if (snapshot && snapshot.sourceVersion === sourceVersion &&
            (!snapshot.progress || snapshot.progress.totalPages === document.numPages)) {
          const saved = snapshot.progress;
          initialPage.current = Math.min(document.numPages, resumePage.current > 1 ? resumePage.current : saved?.page ?? 1);
          setPageNumber(initialPage.current);
          if (saved && saved.page > 1) setReadingMessage(`已接续第 ${saved.page} 页`);
          progressQueue.current = createReadingProgressQueue({
            documentId, sourceVersion, totalPages: document.numPages, revision: saved?.revision ?? 0,
            save: saveReadingProgress,
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
  }, [url, documentId, destroy, fail, paneActive, persistProgress, initialRestore]);

  useEffect(() => {
    const restore = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.documentId !== documentId || !pdf) return;
      const page = event.detail.page;
      if (!sourceVersion || event.detail.sourceVersion !== sourceVersion || !Number.isInteger(page) || page < 1 || page > pdf.numPages) return;
      userNavigated.current = false; resumePage.current = page; setPageNumber(page);
    };
    window.addEventListener("personal-os:restore-pdf-position", restore);
    return () => window.removeEventListener("personal-os:restore-pdf-position", restore);
  }, [documentId, pdf, sourceVersion]);

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
        <PdfCanvasPage key={`${pageNumber}:${zoom}:${width}`} pdf={pdf} pageNumber={pageNumber} title={title} width={width * zoom} onFailure={fail} onRendered={onRendered} /> :
        <div className="file-pdf-paper-placeholder"><p role="status" className="flex min-h-56 items-center justify-center text-[13px] text-[var(--text-secondary)]">正在准备 PDF 预览…</p></div>}
    </div>
    <p className="text-[12px] leading-5 text-[var(--text-secondary)]">逐页显示 PDF；页内预览上限为 25 MiB。文件通过当前登录会话读取，不会发送给第三方阅读服务。</p>
    <div className="flex flex-wrap gap-x-4 text-[12px] text-[var(--accent)]">
      {nativeAvailable ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center">在新窗口预览 PDF</a> : null}
      <a href={`/api/files/${documentId}/download`} className="inline-flex min-h-9 items-center">下载原件</a>
    </div>
  </div>;
}

export function PdfCanvasPage({ pdf, pageNumber, title, width, onFailure, onRendered }: {
  pdf: PDFDocumentProxy; pageNumber: number; title: string; width: number; onFailure: (message: string) => void; onRendered: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generationRef = useRef(0);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const generation = ++generationRef.current;
    let active = true;
    let released = false;
    let page: PDFPageProxy | undefined;
    let render: RenderTask | undefined;
    const release = () => {
      if (released) return;
      released = true;
      render?.cancel();
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
      } catch {
        if (active) onFailure(fallbackMessage);
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); release(); };
  }, [pdf, pageNumber, width, onFailure, onRendered]);
  return <div className="file-pdf-page" data-rendered={rendered || undefined}>
    {!rendered ? <p role="status" className="file-pdf-drawing-status py-3 text-[12px] text-[var(--text-secondary)]">正在绘制第 {pageNumber} 页…</p> : null}
    <canvas ref={canvasRef} role="img" aria-label={`${title}，第 ${pageNumber} 页`} data-pdf-page={pageNumber}
      className="mx-auto block bg-[var(--surface-canvas)] shadow-sm" style={{ visibility: rendered ? "visible" : "hidden" }} />
  </div>;
}
