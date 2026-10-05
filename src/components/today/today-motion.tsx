"use client";
import { DisclosureTrigger } from "@/components/ui/disclosure";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const enteredDates = new Set<string>();
export function TodayMotion({ date, children }: { date: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const key = `life-of-hang:workspace:today-motion:${date}`;
    let visited = enteredDates.has(date);
    try { visited ||= window.sessionStorage.getItem(key) === "1"; window.sessionStorage.setItem(key, "1"); } catch { /* Animation is optional when storage is unavailable. */ }
    enteredDates.add(date);
    if (root.current) root.current.dataset.enter = !visited && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "true" : "false";
  }, [date]);
  return <div ref={root} className="today-calm now-workspace" data-testid="today-calm">{children}</div>;
}

/** Native disclosure semantics with an explicitly interruptible height transition. */
export function TodayDisclosure({ label, children, className = "", testId }: { label: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={`today-disclosure ${className}`} data-expanded={expanded} data-testid={testId}>
    <DisclosureTrigger className="today-disclosure-trigger" expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{label}</DisclosureTrigger>
    <div id={id} className="today-disclosure-grid" inert={!expanded} aria-hidden={!expanded}><div className="today-disclosure-clip"><div className="today-disclosure-content">{children}</div></div></div>
  </div>;
}

/** FLIP only surviving rows after confirmed updates; no artificial success or scroll. */
export function TodayReflow({ signature, children }: { signature: string; children: ReactNode }) {
  const root = useRef<HTMLUListElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.current?.querySelectorAll<HTMLElement>("[data-today-row]").forEach(node => {
      const key = node.dataset.todayRow!;
      const top = node.offsetTop;
      const before = positions.current.get(key);
      if (!reduced && before !== undefined && Math.abs(before - top) > 1 && typeof node.animate === "function") {
        node.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
      }
      next.set(key, top);
    });
    positions.current = next;
  }, [signature]);
  return <ul ref={root} className="today-ledger-list">{children}</ul>;
}
