"use client";

import { Inspector, InspectorButton } from "@/components/shared/inspector";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";

export function NoteDocumentShell({ noteId, editor, inspector }: { noteId: string; editor: React.ReactNode; inspector: React.ReactNode }) {
  const noteInspector = useWorkspacePanel(`note-inspector:${noteId}`);
  return <section className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-11 shrink-0 items-center justify-end border-b px-3"><InspectorButton open={noteInspector.isOpen} onClick={noteInspector.toggle} /></header><div className="min-h-0 flex-1">{editor}</div></div>
    <Inspector open={noteInspector.isOpen} title="笔记详情" onClose={noteInspector.close}>{inspector}</Inspector>
  </section>;
}
