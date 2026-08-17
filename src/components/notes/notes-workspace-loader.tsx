"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { perfMark, perfMeasure } from "@/lib/perf";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function NotesShell() {
  return <main aria-busy="true" className="h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pt-14 pb-5 md:pt-5 sm:px-7 lg:px-10"><div className="mx-auto max-w-5xl"><div className="h-8 w-40 rounded bg-[var(--surface-hover)]" /><div className="mt-5 h-9 max-w-3xl rounded bg-[var(--surface-hover)]" /><div className="mt-5 divide-y border-y"><div className="h-20" /><div className="h-20 bg-[var(--surface-hover)]/60" /><div className="h-20" /></div></div></main>;
}

export function NotesWorkspaceLoader({ folderId, initialView, dailyError }: { folderId?: string; initialView: "all" | "favorites" | "recent"; dailyError: boolean }) {
  const snapshot = useSyncExternalStore(notesWorkspaceResource.subscribe, notesWorkspaceResource.get, notesWorkspaceResource.get);
  useWorkspaceResourceLifecycle(notesWorkspaceResource);
  useEffect(() => {
    perfMark("workspace-visible", { workspace: "notes", cached: Boolean(snapshot.data) });
    void notesWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "notes" })).catch(() => {});
  // The resource owns request sharing and stale decisions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const data = snapshot.data;
  if (!data) return <NotesShell />;
  const selectedFolder = data.folders.find((folder) => folder.id === folderId) ?? null;
  return <NotesWorkspace notes={data.notes} folders={data.folders} timezone={data.timezone} state={data.state} selectedFolder={selectedFolder} initialView={initialView} dailyError={dailyError} initialHasMore={data.hasMore} />;
}
