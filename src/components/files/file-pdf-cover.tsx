"use client";

import { File } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OnProgressParameters, PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "unpdf/pdfjs";
import type { FileRecord } from "@/features/files/queries";
import { observeThumbnailVisibility } from "@/features/files/observe-thumbnail-visibility";
import { createThumbnailLoadQueue } from "@/features/files/thumbnail-load-queue";

export const maxPdfCoverBytes = 12 * 1024 * 1024;
export const pdfCoverTimeoutMs = 20_000;
export const maxPdfCoverPixels = 512 * 512;
// PDF parsing is heavier than photo decoding. Only one cover owns a document
// at a time; finished canvases retain pixels, never PDF bytes or object URLs.
const enqueue = createThumbnailLoadQueue(1);

export function FilePdfCover({ file }: { file: FileRecord }) {
  return <PdfCover key={`${file.id}:${file.file_size}:${file.uploaded_at}`} file={file} />;
}

function PdfCover({ file }: { file: FileRecord }) {
  const anchor = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generationRef = useRef(0);
  const [phase, setPhase] = useState<"waiting" | "loading" | "ready" | "failed">("waiting");
  const eligible = Number.isSafeInteger(file.file_size) && file.file_size >= 8 && file.file_size <= maxPdfCoverBytes;

  useEffect(() => {
    const element = anchor.current;
    const canvas = canvasRef.current;
    if (!eligible || !element || !canvas) return;
    const generation = ++generationRef.current;
    let disposed = false;
    let started = false;
    let finished = false;
    let release: (() => void) | undefined;
    let task: PDFDocumentLoadingTask | undefined;
    let page: PDFPageProxy | undefined;
    let render: RenderTask | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const observation: { stop?: () => void } = {};
    const releaseCanvas = () => {
      // A StrictMode replay may already own this node by the time teardown ends.
      if (canvasRef.current !== canvas || generationRef.current === generation) { canvas.width = 0; canvas.height = 0; }
    };
    let cleanup: Promise<void> | undefined;
    const disposeDocument = () => cleanup ??= (async () => {
      controller.abort();
      render?.cancel();
      if (render) await render.promise.catch(() => {});
      try { page?.cleanup(); } catch { /* The loading task still owns cleanup. */ }
      try { if (task) await task.destroy(); } catch { /* Failed documents still release admission. */ }
      finally { release?.(); release = undefined; }
    })();
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      observation.stop?.();
      if (!disposed) setPhase(success ? "ready" : "failed");
      void disposeDocument();
    };
    const load = async () => {
      if (disposed || finished) return;
      setPhase("loading");
      timer = setTimeout(() => finish(false), pdfCoverTimeoutMs);
      const url = `/api/files/${file.id}/preview`;
      try {
        const response = await fetch(url, { method: "HEAD", credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (disposed || finished) return;
        const bytes = Number(response.headers.get("content-length"));
        if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf" ||
            !Number.isSafeInteger(bytes) || bytes < 8 || bytes > maxPdfCoverBytes) throw new Error("cover_unavailable");
        const { getDocument } = await import("unpdf/pdfjs");
        if (disposed || finished) return;
        task = getDocument({ url, withCredentials: true, disableStream: true, disableAutoFetch: true, rangeChunkSize: 65_536,
          useSystemFonts: true, enableXfa: false, maxImageSize: 4_000_000, canvasMaxAreaInBytes: maxPdfCoverPixels * 4,
          useWorkerFetch: false, useWasm: false, isImageDecoderSupported: false, stopAtErrors: true, verbosity: 0 });
        task.onProgress = ({ loaded, total }: OnProgressParameters) => { if (loaded > maxPdfCoverBytes || total > maxPdfCoverBytes) finish(false); };
        const pdf = await task.promise;
        if (disposed || finished) return;
        if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > 500) throw new Error("cover_page_limit");
        page = await pdf.getPage(1);
        if (disposed || finished) { page.cleanup(); return; }
        const base = page.getViewport({ scale: 1 });
        if (![base.width, base.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("invalid_page_size");
        const viewport = page.getViewport({ scale: Math.min(512 / base.width, 512 / base.height) });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        if (canvas.width * canvas.height > maxPdfCoverPixels || !canvas.getContext("2d")) throw new Error("canvas_unavailable");
        render = page.render({ canvas, viewport, annotationMode: 0, background: "rgb(255,255,255)" });
        await render.promise;
        if (disposed || finished) return;
        canvas.dataset.pdfCoverRendered = "true";
        finish(true);
      } catch { finish(false); }
    };
    observation.stop = observeThumbnailVisibility(element, visible => {
      if (disposed || started || finished) return;
      if (!visible) { release?.(); release = undefined; }
      else if (!release) release = enqueue(() => {
        started = true;
        observation.stop?.();
        // Admission can be synchronous; defer until its release handle exists.
        queueMicrotask(() => { void load(); });
      });
    });
    if (started) observation.stop();
    return () => {
      disposed = true;
      observation.stop?.();
      if (timer) clearTimeout(timer);
      finished = true;
      void disposeDocument().then(releaseCanvas);
    };
  }, [eligible, file.id]);

  return <div ref={anchor} className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[var(--surface-control)] p-3" data-pdf-cover-state={phase}>
    <canvas ref={canvasRef} aria-hidden="true" className="max-h-full max-w-full bg-white object-contain shadow-sm" style={{ display: phase === "ready" ? "block" : "none" }} />
    {phase !== "ready" ? <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]"><File size={36} aria-hidden="true" /><span className="px-2 text-center text-[11px]">{!eligible ? "点击预览 PDF" : phase === "failed" ? "封面暂不可用 · 点击预览" : phase === "loading" ? "正在生成封面…" : "PDF 首页"}</span></div> : null}
    {phase === "ready" ? <span aria-hidden="true" className="absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-neutral-600 shadow-sm">PDF · 1</span> : null}
  </div>;
}
