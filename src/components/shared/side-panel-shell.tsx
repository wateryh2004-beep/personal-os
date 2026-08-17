"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidePanelShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  ariaLabel?: string;
  leading?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "inspector" | "assistant";
  className?: string;
};

/** Shared geometry and interaction contract for inspector and AI detail panels. */
export function SidePanelShell({
  open,
  onClose,
  title,
  ariaLabel = title,
  leading,
  meta,
  children,
  footer,
  variant = "inspector",
  className,
}: SidePanelShellProps) {
  const defaults = variant === "assistant" ? 420 : 360;
  const bounds = variant === "assistant" ? { min: 340, max: 640 } : { min: 300, max: 520 };
  const storageKey = `personal-os:panel-width:${variant}:v1`;
  const [width, setWidth] = useState(defaults);
  const widthRef = useRef(defaults);
  const previousFocus = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restore = window.setTimeout(() => {
      try {
        const stored = Number(localStorage.getItem(storageKey));
        if (Number.isFinite(stored)) {
          const next = Math.max(bounds.min, Math.min(bounds.max, stored));
          widthRef.current = next;
          setWidth(next);
        }
      } catch { /* Persistence is an enhancement. */ }
    }, 0);
    const timer = window.setTimeout(() => asideRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, button")?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(restore);
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [bounds.max, bounds.min, open, storageKey]);

  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia("(max-width: 767px)").matches) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const onMove = (move: PointerEvent) => {
      const max = Math.min(bounds.max, window.innerWidth * (variant === "assistant" ? 0.5 : 0.45));
      const next = Math.max(bounds.min, Math.min(max, startWidth + startX - move.clientX));
      widthRef.current = next;
      setWidth(next);
    };
    const onEnd = () => {
      try { localStorage.setItem(storageKey, String(Math.round(widthRef.current))); } catch { /* no-op */ }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };
  const resetWidth = () => {
    widthRef.current = defaults;
    setWidth(defaults);
    try { localStorage.removeItem(storageKey); } catch { /* no-op */ }
  };
  if (!open) return null;

  return <>
    <button
      type="button"
      onClick={onClose}
      className="fixed inset-x-0 bottom-0 top-[var(--toolbar-height)] z-30 bg-black/10 md:hidden"
      aria-label={`关闭${ariaLabel}遮罩`}
    />
    <aside
      ref={asideRef}
      style={{ "--panel-width": `${width}px` } as React.CSSProperties}
      className={cn(
        "fixed bottom-0 right-0 top-[var(--toolbar-height)] z-40 flex h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 max-w-full flex-col overflow-hidden border-l border-[color-mix(in_srgb,var(--border)_82%,var(--accent)_18%)] bg-popover text-popover-foreground shadow-[0_18px_48px_rgba(24,24,27,0.09),0_2px_8px_rgba(24,24,27,0.05)] ui-panel-transition animate-in fade-in-0 slide-in-from-right-4 md:w-[min(var(--panel-width),calc(100vw-8px))]",
        variant === "assistant" ? "w-[min(420px,calc(100vw-8px))]" : "w-[min(360px,calc(100vw-8px))]",
        className,
      )}
      aria-label={ariaLabel}
    >
      <button type="button" onPointerDown={resize} onDoubleClick={resetWidth} className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none md:block" aria-label="调整面板宽度，双击恢复默认" />
      <header className={cn(
        "flex h-[var(--toolbar-height)] shrink-0 items-center justify-between border-b px-4",
        variant === "assistant" && "border-[color-mix(in_srgb,var(--border)_75%,var(--accent)_25%)] bg-[color-mix(in_srgb,var(--accent-soft)_48%,var(--surface-canvas))]",
      )}>
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {meta ? <div className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">{meta}</div> : null}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`关闭${ariaLabel}`}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className={cn("workspace-scroll min-h-0 flex-1 overflow-y-auto", variant === "assistant" ? "p-5" : "p-4")}>{children}</div>
      {footer ? <footer className={cn("max-h-[45dvh] shrink-0 overflow-y-auto border-t bg-popover", variant === "assistant" ? "border-[color-mix(in_srgb,var(--border)_75%,var(--accent)_25%)] bg-[color-mix(in_srgb,var(--surface-canvas)_92%,var(--accent-soft))] p-4" : "p-3")}>{footer}</footer> : null}
    </aside>
  </>;
}
