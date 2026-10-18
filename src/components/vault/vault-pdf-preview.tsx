"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "unpdf/pdfjs";
import { PdfCanvasPage, maxInlinePdfBytes, maxInlinePdfPages, maxPdfCanvasPixels, pdfLoadTimeoutMs } from "@/components/files/file-pdf-preview";

const fallback = "PDF 预览暂不可用，请下载原件查看。";
const control = "min-h-11 rounded-lg px-3 text-sm hover:bg-[var(--surface-control)] disabled:opacity-40";
const painted = () => {};

/** Receives only bytes already fetched with the current tab's vault proof. */
export function VaultPdfPreview({ blob, title }: { blob: Blob; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(640);
  const container = useRef<HTMLDivElement>(null);
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const destroy = useCallback(() => {
    const task = taskRef.current; taskRef.current = null;
    if (task) void task.destroy().catch(() => {});
  }, []);
  const fail = useCallback((message: string) => { setError(message); setPdf(null); destroy(); }, [destroy]);
  const renderFailed = useCallback(() => fail(fallback), [fail]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) { active = false; fail("PDF 加载超时，请下载原件查看。"); }
    }, pdfLoadTimeoutMs);
    void (async () => {
      try {
        if (blob.size > maxInlinePdfBytes || blob.size < 8) {
          if (active) fail(blob.size > maxInlinePdfBytes ? "文件超过 25 MiB 页内预览上限，请下载原件查看。" : fallback);
          return;
        }
        const [{ getDocument }, buffer] = await Promise.all([import("unpdf/pdfjs"), blob.arrayBuffer()]);
        if (!active) return;
        const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, enableXfa: false,
          maxImageSize: maxPdfCanvasPixels, canvasMaxAreaInBytes: maxPdfCanvasPixels * 4,
          useWorkerFetch: false, useWasm: false, isImageDecoderSupported: false, stopAtErrors: true, verbosity: 0 });
        taskRef.current = task;
        const document = await task.promise;
        if (!active) return;
        if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > maxInlinePdfPages) {
          fail("此 PDF 页数超出页内预览范围，请下载原件查看。"); return;
        }
        setPdf(document);
      } catch (reason) {
        if (active) fail(reason instanceof Error && reason.name === "PasswordException"
          ? "此 PDF 需要密码，请下载原件查看。" : fallback);
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); destroy(); };
  }, [blob, destroy, fail]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const measured = Math.floor(element.getBoundingClientRect().width - 24);
      if (measured > 0) setWidth(Math.max(160, Math.min(1600, measured)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
    {pdf ? <div aria-label="PDF 阅读控制" className="flex shrink-0 flex-wrap items-center gap-1 text-sm">
      <button className={control} disabled={pageNumber <= 1} onClick={() => setPageNumber(value => Math.max(1, value - 1))}>上一页</button>
      <span aria-live="polite">第 {pageNumber} / {pdf.numPages} 页</span>
      <button className={control} disabled={pageNumber >= pdf.numPages} onClick={() => setPageNumber(value => Math.min(pdf.numPages, value + 1))}>下一页</button>
      <button className={control} aria-label="缩小 PDF" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
      <button className={control} onClick={() => setZoom(1)}>适合宽度</button>
      <button className={control} aria-label="放大 PDF" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}>+</button>
    </div> : null}
    <div ref={container} className="min-h-0 flex-1 overflow-auto rounded-lg bg-[var(--surface-control)] p-3">
      {error ? <p role="alert" className="p-3 text-sm">{error}</p> : pdf ? <PdfCanvasPage key={pageNumber + ":" + zoom + ":" + width} pdf={pdf} pageNumber={pageNumber}
        title={title} width={width * zoom} onFailure={renderFailed} onRendered={painted} /> : <p role="status" className="p-5 text-sm">正在准备 PDF 预览…</p>}
    </div>
  </div>;
}
