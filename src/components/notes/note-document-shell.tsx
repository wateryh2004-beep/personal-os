"use client";

import { Inspector } from "@/components/shared/inspector";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { publishNotesNavigatorTitle } from "@/features/notes/navigator-title-sync";
import { useRouter } from "next/navigation";
import { ChevronLeft, PanelRight } from "lucide-react";

export function NoteDocumentShell({ noteId, editor, inspector }: { noteId: string; editor: React.ReactNode; inspector: React.ReactNode }) {
  const noteInspector = useWorkspacePanel(`note-inspector:${noteId}`);
  const router = useRouter();

  const handleEditorInput = (event: React.FormEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("aria-label") !== "笔记标题") return;
    publishNotesNavigatorTitle(noteId, target.value);
  };

  return (
    <section
      onInputCapture={handleEditorInput}
      className="notes-document-shell relative flex h-full min-h-0 overflow-hidden bg-[var(--surface-canvas)]"
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] md:hidden"
            aria-label="返回笔记列表"
          >
            <ChevronLeft className="size-[18px]" aria-hidden="true" />
          </button>
          <span className="hidden md:block" />
          <button
            type="button"
            onClick={noteInspector.toggle}
            aria-pressed={noteInspector.isOpen}
            aria-label={noteInspector.isOpen ? "关闭笔记详情" : "打开笔记详情"}
            className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <PanelRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
      <Inspector
        open={noteInspector.isOpen}
        title="笔记详情"
        onClose={noteInspector.close}
        className="notes-inspector"
      >
        {inspector}
      </Inspector>
    </section>
  );
}
