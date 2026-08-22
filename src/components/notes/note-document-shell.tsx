"use client";

import { Inspector, InspectorButton } from "@/components/shared/inspector";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { publishNotesNavigatorTitle } from "@/features/notes/navigator-title-sync";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function NoteDocumentShell({ noteId, editor, inspector }: { noteId: string; editor: React.ReactNode; inspector: React.ReactNode }) {
  const noteInspector = useWorkspacePanel(`note-inspector:${noteId}`);
  const router = useRouter();
  const handleEditorInput = (event: React.FormEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("aria-label") !== "笔记标题") return;
    publishNotesNavigatorTitle(noteId, target.value);
  };
  return <section onInputCapture={handleEditorInput} className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-11 shrink-0 items-center justify-between border-b px-3"><div className="md:hidden"><button type="button" onClick={() => router.back()} className="flex h-8 items-center gap-1 rounded-md px-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label="返回笔记列表"><ChevronLeft className="size-4" aria-hidden="true" />返回</button></div><div className="hidden md:block" /><InspectorButton open={noteInspector.isOpen} onClick={noteInspector.toggle} /></header><div className="min-h-0 flex-1">{editor}</div></div>
    <Inspector open={noteInspector.isOpen} title="笔记详情" onClose={noteInspector.close}>{inspector}</Inspector>
  </section>;
}
