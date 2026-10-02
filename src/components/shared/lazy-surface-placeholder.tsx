"use client";

import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function LoadingContent() {
  return <div className="space-y-3 py-3" role="status" aria-label="正在加载…">
    <div className="h-9 rounded-[var(--radius-md)] bg-[var(--surface-control)]" />
    <div className="h-3 w-3/4 rounded bg-[var(--surface-control)]" />
    <div className="h-3 w-1/2 rounded bg-[var(--surface-control)]" />
    <p className="text-xs text-[var(--text-tertiary)]">正在加载…</p>
  </div>;
}

/** The parent keeps one Dialog root mounted while its content chunk loads. */
export function LazyDialogPlaceholder({ title }: { title: string }) {
  return <DialogContent>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription className="sr-only">加载完成后即可使用，可随时关闭</DialogDescription>
    </DialogHeader>
    <LoadingContent />
  </DialogContent>;
}
