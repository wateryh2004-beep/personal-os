"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Inspector, InspectorButton } from "@/components/shared/inspector";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";

export function NoteDocumentShell({ noteId, editor, inspector }: { noteId: string; editor: React.ReactNode; inspector: React.ReactNode }) {
  const noteInspector = useWorkspacePanel(`note-inspector:${noteId}`);
  return <section className="flex h-[calc(100dvh-var(--toolbar-height))] min-h-[560px] overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-[var(--toolbar-height)] shrink-0 items-center justify-between border-b px-3 sm:px-4"><Link href="/notes" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><ArrowLeft className="size-4" aria-hidden="true" />Notes</Link><InspectorButton open={noteInspector.isOpen} onClick={noteInspector.toggle} /></header><div className="min-h-0 flex-1">{editor}</div></div>
    <Inspector open={noteInspector.isOpen} title="笔记详情" onClose={noteInspector.close}>{inspector}</Inspector>
  </section>;
}
