"use client";

import { X } from "lucide-react";
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
  if (!open) return null;

  return <>
    <button
      type="button"
      onClick={onClose}
      className="fixed inset-x-0 bottom-0 top-[var(--toolbar-height)] z-30 bg-black/10 md:hidden"
      aria-label={`关闭${ariaLabel}遮罩`}
    />
    <aside
      className={cn(
        "fixed bottom-0 right-0 top-[var(--toolbar-height)] z-40 flex h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 max-w-full flex-col overflow-hidden border-l bg-popover text-popover-foreground shadow-[0_16px_40px_rgba(24,24,27,0.12)] ui-panel-transition animate-in fade-in-0 slide-in-from-right-4",
        variant === "assistant" ? "w-[min(420px,calc(100vw-8px))]" : "w-[min(360px,calc(100vw-8px))]",
        className,
      )}
      aria-label={ariaLabel}
    >
      <header className="flex h-[var(--toolbar-height)] shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {meta ? <div className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">{meta}</div> : null}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`关闭${ariaLabel}`}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer ? <footer className="max-h-[45dvh] shrink-0 overflow-y-auto border-t bg-popover p-3">{footer}</footer> : null}
    </aside>
  </>;
}
