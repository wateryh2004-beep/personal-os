"use client";

import { usePathname } from "next/navigation";
import { NotesLiveWorkspaceShell } from "@/components/notes/notes-live-workspace-shell";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";

/** The full navigator shares the list's authorized read and never gates children. */
export function NotesWorkspaceShellLoader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The list route streams its initial data; document routes still fetch the navigator.
  const { data } = useWorkspaceResource(notesWorkspaceResource, "notes-navigator", undefined, pathname === "/notes");
  return <NotesLiveWorkspaceShell folders={data?.folders ?? []} notes={data?.navigatorNotes ?? []}>{children}</NotesLiveWorkspaceShell>;
}
