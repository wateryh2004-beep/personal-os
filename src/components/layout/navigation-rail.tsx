"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One indicator follows actual link geometry, including pending destinations. */
export function NavigationRail({ children, selection, horizontal = false, label = "主导航", className, style }: { children: ReactNode; selection: string; horizontal?: boolean; label?: string; className?: string; style?: CSSProperties }) {
  const root = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const nav = root.current;
    const mark = indicator.current;
    if (!nav || !mark) return;
    const update = () => {
      const link = nav.querySelector<HTMLElement>('[data-nav-selected="true"]');
      if (!link) { delete nav.dataset.indicatorReady; return; }
      const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top;
      mark.style.height = `${link.offsetHeight}px`;
      if (horizontal) {
        mark.style.width = `${link.offsetWidth}px`;
        mark.style.transform = `translate(${link.getBoundingClientRect().left - nav.getBoundingClientRect().left}px,${top}px)`;
      } else mark.style.transform = `translateY(${top}px)`;
      nav.dataset.indicatorReady = "true";
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [horizontal, selection]);
  return <nav ref={root} aria-label={label} style={style} data-orientation={horizontal ? "horizontal" : "vertical"} className={cn("navigation-rail", horizontal ? "navigation-rail-horizontal" : "space-y-5.5", className)}>
    <div ref={indicator} className="navigation-indicator" aria-hidden="true" />
    {children}
  </nav>;
}
