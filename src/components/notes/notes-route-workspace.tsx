"use client";

import { Suspense, use } from "react";
import { NotesWorkspaceLoader } from "./notes-workspace-loader";
import { notesWorkspaceResource, type NotesWorkspaceData } from "@/features/notes/workspace-resource";
import { useWorkspaceResource, type WorkspaceBootstrap } from "@/lib/workspace-resource-cache";

type Bootstrap = WorkspaceBootstrap<NotesWorkspaceData>;
function StreamedNotesSeed({ bootstrap }: { bootstrap: Promise<Bootstrap> }) {
  const resolved = use(bootstrap);
  useWorkspaceResource(notesWorkspaceResource, null, resolved);
  return null;
}

/** The warm list remains interactive while the new server read streams in. */
export function NotesRouteWorkspace({ bootstrap, folderId, initialView, dailyError }: {
  bootstrap: Promise<Bootstrap>; folderId?: string; initialView: "all" | "favorites" | "recent"; dailyError: boolean;
}) {
  return <>
    <Suspense fallback={null}><StreamedNotesSeed bootstrap={bootstrap} /></Suspense>
    <NotesWorkspaceLoader folderId={folderId} initialView={initialView} dailyError={dailyError} deferInitialRead />
  </>;
}
