"use client";

import { Sparkles } from "lucide-react";
import { SidePanelShell } from "@/components/shared/side-panel-shell";

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
  return <SidePanelShell open={open} onClose={onClose} title={title} ariaLabel="AI 助手" leading={<span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--surface-canvas)] text-[var(--accent)] shadow-[0_1px_2px_rgba(24,24,27,0.04)]"><Sparkles className="size-3.5" aria-hidden="true" /></span>} meta={<>{context}{context && status ? " · " : null}{status}</>} footer={footer} variant="assistant" className={className}>{children}</SidePanelShell>;
}
