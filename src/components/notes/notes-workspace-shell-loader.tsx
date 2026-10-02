"use client";

import { NotesLiveWorkspaceShell } from "@/components/notes/notes-live-workspace-shell";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";

/** The full navigator shares the list's authorized read and never gates children. */
export function NotesWorkspaceShellLoader({ children }: { children: React.ReactNode }) {
  const { data } = useWorkspaceResource(notesWorkspaceResource, "notes-navigator");
  return <NotesLiveWorkspaceShell folders={data?.folders ?? []} notes={data?.navigatorNotes ?? []}>{children}</NotesLiveWorkspaceShell>;
}
