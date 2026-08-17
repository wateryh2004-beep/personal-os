"use client";

import { PanelRightClose } from "lucide-react";
import { SidePanelShell } from "@/components/shared/side-panel-shell";

export function Inspector({ open, title = "详情", onClose, children, className }: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return <SidePanelShell open={open} onClose={onClose} title={title} className={className}>{children}</SidePanelShell>;
}

export function InspectorButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={open} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label={open ? "关闭详情" : "打开详情"}><PanelRightClose className="size-4" aria-hidden="true" /><span className="hidden sm:inline">详情</span></button>;
}
