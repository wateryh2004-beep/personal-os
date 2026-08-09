"use client";

import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AISidecar({ open, onClose, title = "AI", context, status, children, footer, className }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  context?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return <><button type="button" onClick={onClose} className="fixed inset-x-0 bottom-0 top-[var(--toolbar-height)] z-40 bg-black/15 md:hidden" aria-label="关闭 AI 助手遮罩"/><aside className={cn("fixed bottom-0 right-0 top-[var(--toolbar-height)] z-50 flex h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 w-[min(420px,calc(100vw-8px))] max-w-full flex-col overflow-hidden border-l bg-[var(--surface-canvas)] shadow-sm", className)} aria-label="AI 助手">
    <header className="flex h-[var(--toolbar-height)] shrink-0 items-center justify-between border-b px-4"><div className="flex min-w-0 items-center gap-2"><Sparkles className="size-4 text-[var(--accent)]" aria-hidden="true" /><h2 className="text-sm font-semibold">{title}</h2>{context ? <div className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">{context}</div> : null}{status ? <div className="text-[11px] text-[var(--text-tertiary)]">{status}</div> : null}</div><button type="button" onClick={onClose} className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label="关闭 AI"><X className="size-4" aria-hidden="true" /></button></header>
    <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    {footer ? <footer className="max-h-[45dvh] shrink-0 overflow-y-auto border-t bg-[var(--surface-canvas)] p-3">{footer}</footer> : null}
  </aside></>;
}
