"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  NotesWorkspaceShell,
  type NotesNavigatorFolder,
  type NotesNavigatorNote,
} from "@/components/notes/notes-workspace-shell";
import {
  notesNavigatorTitleEvent,
  patchNavigatorNoteTitle,
  type NotesNavigatorTitleDetail,
} from "@/features/notes/navigator-title-sync";

export function NotesLiveWorkspaceShell({
  folders,
  notes,
  children,
  documentView,
}: {
  folders: NotesNavigatorFolder[];
  notes: NotesNavigatorNote[];
  children: React.ReactNode;
  documentView?: boolean;
}) {
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as NotesNavigatorTitleDetail | undefined;
      if (!detail?.noteId || typeof detail.title !== "string") return;
      // Navigator recomputation is not part of the urgent title-input update.
      startTransition(() => {
        setTitleOverrides((current) =>
          current[detail.noteId] === detail.title
            ? current
            : { ...current, [detail.noteId]: detail.title },
        );
      });
    };

    window.addEventListener(notesNavigatorTitleEvent, handleTitleChange);
    return () => window.removeEventListener(notesNavigatorTitleEvent, handleTitleChange);
  }, []);

  const liveNotes = useMemo(() => {
    let current = notes;
    for (const [noteId, title] of Object.entries(titleOverrides)) {
      current = patchNavigatorNoteTitle(current, noteId, title);
    }
    return current;
  }, [notes, titleOverrides]);

  return (
    <NotesWorkspaceShell folders={folders} notes={liveNotes} documentView={documentView}>
      {children}
    </NotesWorkspaceShell>
  );
}
