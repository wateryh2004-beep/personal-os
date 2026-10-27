"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { containedTransform } from "@/lib/motion/contained-transform";

/** Only finite source geometry is read; no image, note or private DOM is copied. */
export function useFilePreviewMotion(open: boolean, launcher: RefObject<HTMLElement | null>, sourceKey?: string | null) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!surface) return;
    let geometry = "";
    const refresh = () => {
      if (!surface.isConnected) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      const mobile = window.matchMedia("(max-width: 639px)").matches;
      // Set the resting CSS box before measuring. The CSS-only starting style
      // is already contained even before this first layout effect can run.
      surface.style.setProperty("--file-viewport-left", `${left}px`);
      surface.style.setProperty("--file-viewport-top", `${top}px`);
      surface.style.setProperty("--file-viewport-width", `${width}px`);
      surface.style.setProperty("--file-viewport-height", `${height}px`);
      surface.style.setProperty("--file-viewport-bottom", `${window.innerHeight - top - height}px`);
      const computed = getComputedStyle(surface);
      const boxWidth = Number.parseFloat(computed.width) || surface.offsetWidth, boxHeight = Number.parseFloat(computed.height) || surface.offsetHeight;
      const next = `${left}:${top}:${width}:${height}:${boxWidth}:${boxHeight}:${mobile}`;
      if (geometry && geometry !== next) {
        // Resizing invalidates the old viewport's transform. End that motion at
        // the newly contained resting box; keep the real viewer and its focus.
        for (const animation of surface.getAnimations?.() ?? []) {
          const effect = animation.effect;
          if (typeof KeyframeEffect !== "undefined" && effect instanceof KeyframeEffect && effect.getKeyframes().some((frame: ComputedKeyframe) => "transform" in frame)) animation.cancel();
        }
      }
      geometry = next;
      const rest = { left: mobile ? left : left + (width - boxWidth) / 2, top: mobile ? top + height - boxHeight : top + (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
      const source = launcher.current?.closest<HTMLElement>("[data-file-preview-source]") ?? launcher.current;
      const rect = source?.getBoundingClientRect();
      const clip = source?.closest<HTMLElement>(".workspace-scroll")?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < top + height && rect.right > left && rect.left < left + width && (!clip || rect.bottom > clip.top && rect.top < clip.bottom && rect.right > clip.left && rect.left < clip.right);
      const scaleX = !mobile && visible ? Math.max(.16, Math.min(1, rect.width / boxWidth)) : .96;
      const scaleY = !mobile && visible ? Math.max(.12, Math.min(1, rect.height / boxHeight)) : .96;
      const origin = containedTransform(rest, { left, top, width, height }, {
        x: !mobile && visible ? rect.left + rect.width / 2 - (rest.left + boxWidth / 2) : 0,
        y: !mobile && visible ? rect.top + rect.height / 2 - (rest.top + boxHeight / 2) : -40,
        scaleX, scaleY, originY: mobile ? 1 : .5,
      }) ?? { x: 0, y: 0, scaleX: .96, scaleY: .96 };
      surface.style.setProperty("--file-origin-x", `${origin.x}px`);
      surface.style.setProperty("--file-origin-y", `${origin.y}px`);
      surface.style.setProperty("--file-origin-scale-x", String(origin.scaleX));
      surface.style.setProperty("--file-origin-scale-y", String(origin.scaleY));
    };
    refresh();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh); observer?.observe(surface);
    window.addEventListener("resize", refresh); window.visualViewport?.addEventListener("resize", refresh); window.visualViewport?.addEventListener("scroll", refresh);
    return () => { observer?.disconnect(); window.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("scroll", refresh); };
  }, [launcher, open, sourceKey, surface]);
  return setSurface;
}
