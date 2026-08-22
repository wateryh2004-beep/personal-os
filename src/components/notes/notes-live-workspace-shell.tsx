"use client";

import { useEffect, useState } from "react";
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
}: {
  folders: NotesNavigatorFolder[];
  notes: NotesNavigatorNote[];
  children: React.ReactNode;
}) {
  const [liveNotes, setLiveNotes] = useState(notes);

  useEffect(() => {
    setLiveNotes(notes);
  }, [notes]);

  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as NotesNavigatorTitleDetail | undefined;
      if (!detail?.noteId || typeof detail.title !== "string") return;
      setLiveNotes((current) => patchNavigatorNoteTitle(current, detail.noteId, detail.title));
    };

    window.addEventListener(notesNavigatorTitleEvent, handleTitleChange);
    return () => window.removeEventListener(notesNavigatorTitleEvent, handleTitleChange);
  }, []);

  return (
    <NotesWorkspaceShell folders={folders} notes={liveNotes}>
      {children}
    </NotesWorkspaceShell>
  );
}
