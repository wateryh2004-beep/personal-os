"use client";
import { observeThumbnailVisibility } from "@/features/files/observe-thumbnail-visibility";
import { ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { canPreviewPhoto } from "@/features/files/browser-state";
import type { FileRecord } from "@/features/files/queries";
import { enqueuePhotoThumbnail, photoThumbnailLoadTimeoutMs } from "@/features/files/thumbnail-load-queue";

function PhotoPlaceholder({ className, waiting = false, elementRef, reason }: { className: string; waiting?: boolean; elementRef?: Ref<HTMLDivElement>; reason?: string }) {
  return <div ref={elementRef} className={`flex flex-col items-center justify-center gap-2 bg-[var(--surface-control)] text-[var(--text-tertiary)] ${className}`}>
    <ImageIcon size={28} aria-hidden="true" /><span className="px-2 text-center text-[11px]">{waiting ? "照片缩略图" : <>{reason ?? "缩略图暂不可用"}<br />可下载原件查看</>}</span>
  </div>;
}


function ScheduledPhoto({ source, title, className }: { source: string; title: string; className: string }) {
  const [phase, setPhase] = useState<"waiting" | "loading" | "ready" | "failed">("waiting");
  const anchorRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const settleRef = useRef<((loaded: boolean) => void) | null>(null);
  const attachImage = useCallback((element: HTMLImageElement | null) => {
    // Retain the last node for passive unmount cleanup. Clearing it in a ref
    // detach callback also clears healthy images during StrictMode ref replay.
    if (element) imageRef.current = element;
  }, []);

  useEffect(() => {
    const element = anchorRef.current;
    if (!element) return;
    let disposed = false;
    let started = false;
    let settled = false;
    let release: (() => void) | undefined;
    const observation: { stop?: () => void } = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (loaded: boolean) => {
      if (disposed || settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (!loaded) imageRef.current?.removeAttribute("src");
      setPhase(loaded ? "ready" : "failed");
      release?.();
      release = undefined;
    };
    settleRef.current = settle;
    observation.stop = observeThumbnailVisibility(element, visible => {
      if (disposed || started || settled) return;
      if (!visible) {
        release?.();
        release = undefined;
      } else if (!release) {
        release = enqueuePhotoThumbnail(() => {
          started = true;
          observation.stop?.();
          // A released slot can arrive during sibling unmounts or StrictMode
          // effect replay. Do not render a source for an already disposed job.
          queueMicrotask(() => {
            if (disposed || settled) return;
            timer = setTimeout(() => settle(false), photoThumbnailLoadTimeoutMs);
            setPhase("loading");
          });
        });
      }
    });
    // The geometry fallback may admit synchronously before returning cleanup.
    if (started) observation.stop();
    return () => {
      disposed = true;
      observation.stop?.();
      if (timer !== undefined) clearTimeout(timer);
      // Clear the native request before another waiting card receives its slot.
      imageRef.current?.removeAttribute("src");
      imageRef.current = null;
      release?.();
      settleRef.current = null;
    };
  }, [source]);

  if (phase === "waiting") return <PhotoPlaceholder className={className} waiting elementRef={anchorRef} />;
  if (phase === "failed") return <PhotoPlaceholder className={className} />;
  // Authenticated thumbnails must bypass Next's shared/public image optimizer.
  // Visibility and our queue have already admitted this request, so load eagerly.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={attachImage} src={source} alt={title} loading="eager" decoding="async" referrerPolicy="no-referrer" onLoad={() => settleRef.current?.(true)} onError={() => settleRef.current?.(false)} className={`bg-[var(--surface-control)] object-contain ${className}`} />;
}

/** Browser-native same-origin thumbnails, viewport gated and three at a time. */
export function FilePhoto({ file, className = "" }: { file: FileRecord; className?: string }) {
  if (!canPreviewPhoto(file)) return <PhotoPlaceholder className={className} reason={file.file_size > 12 * 1024 * 1024 ? "原件超过 12 MiB 预览上限" : "此格式暂不支持缩略图"} />;
  const source = `/api/files/${file.id}/thumbnail`;
  return <ScheduledPhoto key={source} source={source} title={file.title} className={className} />;
}
