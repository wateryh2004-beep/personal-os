"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";

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

const phoneQuery = "(max-width: 767px)";
const phoneSnapshot = () => window.matchMedia(phoneQuery).matches;
function subscribePhone(onChange: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

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
  const defaults = variant === "assistant" ? 420 : 352;
  const bounds = variant === "assistant" ? { min: 340, max: 640 } : { min: 300, max: 520 };
  const storageKey = `personal-os:panel-width:${variant}:v1`;
  const widthRef = useRef(defaults);
  const previousFocus = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const resizeHandleRef = useRef<HTMLButtonElement | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const isMobile = useSyncExternalStore(subscribePhone, phoneSnapshot, () => false);

  const applyWidth = (next: number) => {
    widthRef.current = next;
    asideRef.current?.style.setProperty("--panel-width", `${next}px`);
    resizeHandleRef.current?.setAttribute("aria-valuenow", String(Math.round(next)));
  };

  useMobileBackLayer(open, onClose, `side-panel:${variant}`);

  useLayoutEffect(() => {
    if (!open) return;
    let next = defaults;
    try {
      const saved = localStorage.getItem(storageKey);
      const stored = saved?.trim() ? Number(saved) : NaN;
      if (Number.isFinite(stored) && stored > 0) next = Math.max(bounds.min, Math.min(bounds.max, stored));
    } catch { /* Persistence is an enhancement. */ }
    widthRef.current = next;
    asideRef.current?.style.setProperty("--panel-width", `${next}px`);
    resizeHandleRef.current?.setAttribute("aria-valuenow", String(Math.round(next)));
  }, [bounds.max, bounds.min, defaults, open, storageKey]);

  useLayoutEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  useEffect(() => () => dragCleanup.current?.(), [open]);

  const persistWidth = () => {
    try { localStorage.setItem(storageKey, String(Math.round(widthRef.current))); } catch { /* no-op */ }
  };

  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || window.matchMedia("(max-width: 767px)").matches) return;
    event.preventDefault();
    dragCleanup.current?.();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const max = Math.max(bounds.min, Math.min(bounds.max, window.innerWidth * (variant === "assistant" ? 0.5 : 0.45)));
    let frame: number | null = null;
    asideRef.current?.setAttribute("data-resizing", "true");
    const onMove = (move: PointerEvent) => {
      widthRef.current = Math.max(bounds.min, Math.min(max, startWidth + startX - move.clientX));
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        applyWidth(widthRef.current);
      });
    };
    const cleanup = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      asideRef.current?.removeAttribute("data-resizing");
      dragCleanup.current = null;
    };
    const onEnd = () => {
      applyWidth(widthRef.current);
      persistWidth();
      cleanup();
    };
    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
  };

  const resetWidth = () => {
    dragCleanup.current?.();
    applyWidth(defaults);
    try { localStorage.removeItem(storageKey); } catch { /* no-op */ }
  };

  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
    event.preventDefault();
    if (event.key === "Home") { resetWidth(); return; }
    const max = Math.max(bounds.min, Math.min(bounds.max, window.innerWidth * (variant === "assistant" ? 0.5 : 0.45)));
    applyWidth(Math.max(bounds.min, Math.min(max, widthRef.current + (event.key === "ArrowLeft" ? 16 : -16))));
    persistWidth();
  };

  if (!open) return null;

  return <DialogPrimitive.Root open={open} modal={isMobile} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
    {isMobile ? <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/12" /> : null}
    <DialogPrimitive.Content
      asChild
      aria-modal={isMobile || undefined}
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        // A heading is meaningful on desktop and does not summon a phone keyboard.
        headingRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
      }}
      onInteractOutside={(event) => { if (!isMobile) event.preventDefault(); }}
    >
    <aside
      ref={asideRef}
      style={{ "--panel-width": `${defaults}px` } as React.CSSProperties}
      className={cn(
        "side-panel-surface fixed bottom-0 right-0 top-[var(--toolbar-height)] z-50 flex h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 w-full max-w-full flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--surface-canvas)] text-popover-foreground shadow-[var(--shadow-panel)] ui-panel-transition animate-in fade-in-0 slide-in-from-right-2 md:z-40 md:w-[min(var(--panel-width),calc(100vw-8px))]",
        className,
      )}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        ref={resizeHandleRef}
        role="separator"
        tabIndex={isMobile ? -1 : 0}
        aria-orientation="vertical"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={defaults}
        onPointerDown={resize}
        onKeyDown={resizeWithKeyboard}
        onDoubleClick={resetWidth}
        className="group absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none md:block after:absolute after:inset-y-5 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors after:duration-[var(--motion-fast)] hover:after:bg-[color-mix(in_srgb,var(--accent)_26%,var(--separator))] focus-visible:after:bg-[var(--accent)]"
        aria-label="调整面板宽度，双击恢复默认"
      />
      <header className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3.5 md:h-12",
      )}>
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          <DialogPrimitive.Title asChild><h2 ref={headingRef} tabIndex={-1} className="truncate rounded-[var(--radius-sm)] text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2></DialogPrimitive.Title>
          {meta ? <div className="min-w-0 truncate text-[10.5px] text-[var(--text-tertiary)]">{meta}</div> : null}
        </div>
        <Button variant="ghost" size="icon-sm" className="size-11 md:size-8" onClick={onClose} aria-label={`关闭${ariaLabel}`}>
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </header>
      <div className={cn("workspace-scroll min-h-0 flex-1 overflow-y-auto", variant === "assistant" ? "p-5" : "p-4")}>{children}</div>
      {footer ? (
        <footer className={cn(
          "max-h-[45dvh] shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-canvas)] pb-[max(1rem,env(safe-area-inset-bottom))]",
          variant === "assistant" ? "p-4" : "p-3",
        )}>
          {footer}
        </footer>
      ) : null}
    </aside>
    </DialogPrimitive.Content>
  </DialogPrimitive.Root>;
}
