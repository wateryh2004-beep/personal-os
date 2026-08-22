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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-2 text-[13px] font-medium text-[var(--text-secondary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      aria-label={open ? "关闭详情" : "打开详情"}
    >
      <PanelRightClose className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
      <span className="hidden sm:inline">详情</span>
    </button>
  );
}
