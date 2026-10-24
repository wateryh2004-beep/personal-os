"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Measure once per opening. CSS transitions own interruption and reversal. */
export function useAnchoredDialog(open: boolean, anchor?: RefObject<HTMLElement | null>) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!surface || !open) return;
    const measure = () => {
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const origin = anchor?.current?.getBoundingClientRect();
      const target = surface.getBoundingClientRect();
      const dx = !mobile && origin ? origin.left + origin.width / 2 - target.left - target.width / 2 : 0;
      const dy = !mobile && origin ? origin.top - target.top : 56;
      const scale = !mobile && origin && target.width ? Math.max(.72, Math.min(1, origin.width / target.width)) : 1;
      surface.style.setProperty("--command-origin-x", `${dx}px`);
      surface.style.setProperty("--command-origin-y", `${dy}px`);
      surface.style.setProperty("--command-origin-scale", String(scale));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor, open, surface]);
  return setSurface;
}
