"use client";

import { PanelRightClose, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Inspector({ open, title = "详情", onClose, children, className }: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return <><button type="button" onClick={onClose} className="fixed inset-x-0 bottom-0 top-[var(--toolbar-height)] z-30 bg-black/15 md:hidden" aria-label={`关闭${title}遮罩`}/><aside className={cn("fixed bottom-0 right-0 top-[var(--toolbar-height)] z-40 w-[min(360px,calc(100vw-8px))] max-w-full overflow-hidden border-l bg-[var(--surface-sidebar)] shadow-sm", className)} aria-label={title}>
    <div className="flex h-[var(--toolbar-height)] items-center justify-between border-b px-4"><h2 className="text-sm font-medium">{title}</h2><button type="button" onClick={onClose} className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label={`关闭${title}`}><X className="size-4" aria-hidden="true" /></button></div>
    <div className="workspace-scroll h-[calc(100dvh-var(--toolbar-height)*2)] overflow-y-auto p-4">{children}</div>
  </aside></>;
}

export function InspectorButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={open} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label={open ? "关闭详情" : "打开详情"}><PanelRightClose className="size-4" aria-hidden="true" /><span className="hidden sm:inline">详情</span></button>;
}
