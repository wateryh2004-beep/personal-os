"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { containedTransform } from "@/lib/motion/contained-transform";

/** Only finite source geometry is read; no image, note or private DOM is copied. */
export function useFilePreviewMotion(open: boolean, launcher: RefObject<HTMLElement | null>, sourceKey?: string | null) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!surface) return;
    let geometry = "";
    let viewportGeometry = "";
    let restoreDuration: (() => void) | undefined;
    const transformAnimations = () => (surface.getAnimations?.() ?? []).filter(animation => {
      const effect = animation.effect;
      return typeof KeyframeEffect !== "undefined" && effect instanceof KeyframeEffect && effect.getKeyframes().some((frame: ComputedKeyframe) => "transform" in frame);
    });
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
      const nextViewport = `${left}:${top}:${width}:${height}:${mobile}`;
      const viewportChanged = !!viewportGeometry && viewportGeometry !== nextViewport;
      const contentChanged = !!geometry && geometry !== next && !viewportChanged;
      const animations = transformAnimations();
      // Read presented motion before changing any source variables. Image/PDF
      // decode changes the content box, not the user's viewport or intent.
      const presented = computed.transform;
      const properties = computed.transitionProperty.split(",").map(value => value.trim());
      const durations = computed.transitionDuration.split(",").map(value => value.trim());
      const durationFor = (remaining: number) => properties.map((property, index) => property === "transform" || property === "all" ? `${remaining}ms` : durations[index % durations.length]).join(", ");
      const remaining = Math.max(0, ...animations.filter(animation => animation.playState === "running").map(animation => {
        const end = animation.effect?.getComputedTiming().endTime, elapsed = animation.currentTime;
        return typeof end === "number" && typeof elapsed === "number" && Number.isFinite(end) ? Math.max(0, Math.min(end, end - elapsed)) : 0;
      }));
      if (viewportChanged) {
        restoreDuration?.(); restoreDuration = undefined;
        surface.style.setProperty("transition-duration", durationFor(0));
        animations.forEach(animation => animation.cancel());
      }
      geometry = next;
      viewportGeometry = nextViewport;
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
      if (contentChanged && remaining > 0 && typeof DOMMatrixReadOnly !== "undefined" && presented !== "none") {
        const matrix = new DOMMatrixReadOnly(presented);
        const start = matrix.is2D && matrix.b === 0 && matrix.c === 0 ? containedTransform(rest, { left, top, width, height }, {
          x: matrix.e + (mobile ? 0 : boxWidth / 2), y: matrix.f + (mobile ? 0 : boxHeight / 2), scaleX: matrix.a, scaleY: matrix.d, originY: mobile ? 1 : .5,
        }) : null;
        if (start) {
          // Retarget the native CSS transition from its current contained pose,
          // using only its remaining budget. Native close/reopen reversal and
          // Radix Presence keep ownership of the lifecycle; no parallel timer.
          restoreDuration?.();
          surface.style.setProperty("transition-duration", durationFor(0));
          surface.style.setProperty("transform", `translate(${mobile ? "0px, 0px" : "-50%, -50%"}) translate(${start.x}px, ${start.y}px) scale(${start.scaleX}, ${start.scaleY})`);
          void getComputedStyle(surface).transform;
          surface.style.setProperty("transition-duration", durationFor(remaining));
          surface.style.removeProperty("transform");
          const finish = (event: TransitionEvent) => { if (event.target === surface && event.propertyName === "transform") restoreDuration?.(); };
          restoreDuration = () => { surface.removeEventListener("transitionend", finish); surface.style.removeProperty("transition-duration"); restoreDuration = undefined; };
          surface.addEventListener("transitionend", finish);
        }
      }
      if (viewportChanged) { void getComputedStyle(surface).transform; surface.style.removeProperty("transition-duration"); }
    };
    refresh();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh); observer?.observe(surface);
    window.addEventListener("resize", refresh); window.visualViewport?.addEventListener("resize", refresh); window.visualViewport?.addEventListener("scroll", refresh);
    return () => { restoreDuration?.(); observer?.disconnect(); window.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("scroll", refresh); };
  }, [launcher, open, sourceKey, surface]);
  return setSurface;
}
