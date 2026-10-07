"use client";

import { File } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileRecord } from "@/features/files/queries";
import { observeThumbnailVisibility } from "@/features/files/observe-thumbnail-visibility";
import { createThumbnailLoadQueue } from "@/features/files/thumbnail-load-queue";

export const maxPdfCoverBytes = 12 * 1024 * 1024;
export const maxPdfCoverImageBytes = 128 * 1024;
export const pdfCoverTimeoutMs = 35_000;
export const maxPdfCoverRequests = 8;
const enqueue = createThumbnailLoadQueue(3);

type Phase = "waiting" | "loading" | "ready" | "failed";

/** List cards never fetch or parse PDF bytes. The original reader starts on click. */
export function FilePdfCover({ file }: { file: FileRecord }) {
  return <PdfCover key={`${file.id}:${file.file_size}:${file.uploaded_at}`} file={file} />;
}

function PdfCover({ file }: { file: FileRecord }) {
  const anchor = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const attachImage = useCallback((element: HTMLImageElement | null) => { if (element) image.current = element; }, []);
  const settleRef = useRef<((ok: boolean) => void) | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [source, setSource] = useState<string>();
  const eligible = Number.isSafeInteger(file.file_size) && file.file_size >= 8 && file.file_size <= maxPdfCoverBytes && !file.archived_at;

  useEffect(() => {
    const element = anchor.current;
    if (!eligible || !element) return;
    const controller = new AbortController();
    let disposed = false, started = false, settled = false, attempts = 0;
    let release: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let objectUrl: string | undefined;
    let revealFrame: number | undefined;
    const observation: { stop?: () => void } = {};
    const finish = (ok: boolean) => {
      if (disposed || settled) return;
      settled = true;
      if (retry) clearTimeout(retry);
      if (deadline) clearTimeout(deadline);
      controller.abort();
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      release?.(); release = undefined;
      if (!ok) {
        image.current?.removeAttribute("src");
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
        setSource(undefined);
      }
      setPhase(ok ? "ready" : "failed");
    };
    settleRef.current = (ok) => {
      if (!ok) { finish(false); return; }
      // Give the mounted opacity-0 image a painted frame before fading in,
      // including instantaneous browser-cache / Blob loads.
      if (disposed || settled || revealFrame !== undefined) return;
      revealFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(() => finish(true));
      });
    };
    const load = async () => {
      if (disposed || settled) return;
      attempts++;
      try {
        // Browser may reuse bytes only after the server rechecks current access.
        const response = await fetch(`/api/files/${file.id}/pdf-cover`, {
          credentials: "same-origin", cache: "no-cache", signal: controller.signal,
        });
        if (disposed || settled) { await response.body?.cancel().catch(() => {}); return; }
        if (response.status === 202) {
          await response.body?.cancel().catch(() => {});
          if (attempts >= maxPdfCoverRequests) { finish(false); return; }
          const requestedDelay = Number(response.headers.get("retry-after") ?? 3);
          const delay = Number.isFinite(requestedDelay) ? Math.min(10, Math.max(1, requestedDelay)) : 3;
          retry = setTimeout(schedule, delay * 1000);
          return;
        }
        const size = Number(response.headers.get("content-length"));
        if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim() !== "image/webp" ||
            !Number.isSafeInteger(size) || size < 1 || size > maxPdfCoverImageBytes || !response.body) {
          await response.body?.cancel().catch(() => {});
          finish(false); return;
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let received = 0;
        try {
          while (true) {
            controller.signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > size || received > maxPdfCoverImageBytes) throw new Error("cover_image_too_large");
            chunks.push(new Uint8Array(value));
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (received !== size) throw new Error("cover_image_size_mismatch");
        if (disposed || settled) return;
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: "image/webp" }));
        setSource(objectUrl);
      } catch { finish(false); }
      finally { release?.(); release = undefined; }
    };
    function schedule() {
      if (disposed || settled) return;
      release = enqueue(() => queueMicrotask(() => { void load(); }));
    }
    observation.stop = observeThumbnailVisibility(element, visible => {
      if (disposed || started || settled) return;
      if (!visible) { release?.(); release = undefined; return; }
      started = true;
      observation.stop?.();
      setPhase("loading");
      deadline = setTimeout(() => finish(false), pdfCoverTimeoutMs);
      schedule();
    });
    if (started) observation.stop();
    return () => {
      disposed = true;
      observation.stop?.();
      controller.abort();
      if (retry) clearTimeout(retry);
      if (deadline) clearTimeout(deadline);
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      image.current?.removeAttribute("src");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      release?.();
      settleRef.current = null;
    };
  }, [eligible, file.id]);

  return <div ref={anchor} className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[var(--surface-control)] p-3" data-pdf-cover-state={phase}>
    {source ? <img // eslint-disable-line @next/next/no-img-element
      ref={attachImage} src={source} alt="" aria-hidden="true" decoding="async"
      onLoad={() => settleRef.current?.(true)} onError={() => settleRef.current?.(false)}
      data-pdf-cover-rendered={phase === "ready" ? "true" : undefined}
      className={`max-h-full max-w-full bg-white object-contain shadow-sm transition-opacity duration-200 motion-reduce:transition-none ${phase === "ready" ? "opacity-100" : "opacity-0"}`} /> : null}
    {phase !== "ready" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]"><File size={36} aria-hidden="true" /><span className="px-2 text-center text-[11px]">{!eligible ? "点击预览 PDF" : phase === "failed" ? "封面暂不可用 · 点击预览" : "PDF 首页"}</span></div> : null}
    {phase === "ready" ? <span aria-hidden="true" className="absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-neutral-600 shadow-sm">PDF · 1</span> : null}
  </div>;
}
