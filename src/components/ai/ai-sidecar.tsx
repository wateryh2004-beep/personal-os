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
  return <SidePanelShell open={open} onClose={onClose} title={title} ariaLabel="AI 助手" leading={<Sparkles className="size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />} meta={<>{context}{context && status ? " · " : null}{status}</>} footer={footer} variant="assistant" className={className}>{children}</SidePanelShell>;
}
