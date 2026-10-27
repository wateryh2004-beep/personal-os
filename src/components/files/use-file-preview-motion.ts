"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Only finite source geometry is read; no image, note or private DOM is copied. */
export function useFilePreviewMotion(open: boolean, launcher: RefObject<HTMLElement | null>, sourceKey?: string | null) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open || !surface) return;
    const source = launcher.current?.closest<HTMLElement>("[data-file-preview-source]") ?? launcher.current;
    const rect = source?.getBoundingClientRect();
    const clip = source?.closest<HTMLElement>(".workspace-scroll")?.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    // Offset dimensions describe the resting surface even while CSS is entering.
    const width = surface.offsetWidth;
    const height = surface.offsetHeight;
    const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth && (!clip || rect.bottom > clip.top && rect.top < clip.bottom && rect.right > clip.left && rect.left < clip.right);
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth), bottom = top + (viewport?.height ?? window.innerHeight);
    const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
    const sourceX = !mobile && visible ? rect.left + rect.width / 2 - window.innerWidth / 2 : 0;
    const sourceY = !mobile && visible ? rect.top + rect.height / 2 - window.innerHeight / 2 : -40;
    const scaleX = !mobile && visible && width ? Math.max(.16, Math.min(1, rect.width / width)) : 1;
    const scaleY = !mobile && visible && height ? Math.max(.12, Math.min(1, rect.height / height)) : 1;
    // Both endpoints fit the visible viewport, so the shared monotonic CSS
    // interpolation also fits every frame, including reverse/interruption.
    // A short screen may have less than 40px above the bottom sheet.
    const restingBottom = window.innerHeight - (Number.parseFloat(getComputedStyle(surface).bottom) || 0);
    const y = mobile ? -Math.min(40, Math.max(0, restingBottom - height - top))
      : clamp(window.innerHeight / 2 + sourceY, top + height * scaleY / 2, bottom - height * scaleY / 2) - window.innerHeight / 2;
    const x = mobile ? 0 : clamp(window.innerWidth / 2 + sourceX, left + width * scaleX / 2, right - width * scaleX / 2) - window.innerWidth / 2;
    surface.style.setProperty("--file-origin-x", `${x}px`);
    surface.style.setProperty("--file-origin-y", `${y}px`);
    surface.style.setProperty("--file-origin-scale-x", String(scaleX));
    surface.style.setProperty("--file-origin-scale-y", String(scaleY));
  }, [launcher, open, sourceKey, surface]);
  return setSurface;
}
