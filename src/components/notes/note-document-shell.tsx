"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Inspector, InspectorButton } from "@/components/shared/inspector";

export function NoteDocumentShell({ editor, inspector }: { editor: React.ReactNode; inspector: React.ReactNode }) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  return <section className="flex h-[calc(100dvh-var(--toolbar-height))] min-h-[560px] overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-[var(--toolbar-height)] shrink-0 items-center justify-between border-b px-3 sm:px-4"><Link href="/notes" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><ArrowLeft className="size-4" aria-hidden="true" />Notes</Link><InspectorButton open={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)} /></header><div className="min-h-0 flex-1">{editor}</div></div>
    <Inspector open={inspectorOpen} title="笔记详情" onClose={() => setInspectorOpen(false)}>{inspector}</Inspector>
  </section>;
}
