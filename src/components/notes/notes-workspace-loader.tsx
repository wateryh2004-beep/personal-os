"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { notesWorkspaceResource, type NotesWorkspaceData } from "@/features/notes/workspace-resource";
import { lastNotesListSessionKey, lastNotesListTtlMs } from "@/features/notes/navigation";
import { perfMark, perfMeasure } from "@/lib/perf";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function NotesShell() {
  return <main aria-busy="true" className="h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pt-14 pb-5 md:pt-5 sm:px-7 lg:px-10"><div className="mx-auto max-w-5xl"><div className="h-8 w-40 rounded bg-[var(--surface-hover)]" /><div className="mt-5 h-9 max-w-3xl rounded bg-[var(--surface-hover)]" /><div className="mt-5 divide-y border-y"><div className="h-20" /><div className="h-20 bg-[var(--surface-hover)]/60" /><div className="h-20" /></div></div></main>;
}

export function NotesWorkspaceLoader({ initialWorkspace, folderId, initialView, dailyError }: { initialWorkspace: NotesWorkspaceData; folderId?: string; initialView: "all" | "favorites" | "recent"; dailyError: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const listHref = useMemo(() => `${pathname}${search ? `?${search}` : ""}`, [pathname, search]);
  const snapshot = useSyncExternalStore(notesWorkspaceResource.subscribe, notesWorkspaceResource.get, notesWorkspaceResource.get);
  useWorkspaceResourceLifecycle(notesWorkspaceResource);
  useEffect(() => {
    saveWorkspaceSession(lastNotesListSessionKey, { href: listHref }, lastNotesListTtlMs);
  }, [listHref]);
  useEffect(() => {
    const hadCachedData = notesWorkspaceResource.get().data !== undefined;
    notesWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "notes", cached: hadCachedData, source: "rsc" });
    void notesWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "notes" })).catch(() => {});
  }, [initialWorkspace]);
  const data = snapshot.data ?? initialWorkspace;
  if (!data) return <NotesShell />;
  const selectedFolder = data.folders.find((folder) => folder.id === folderId) ?? null;
  return <NotesWorkspace notes={data.notes} folders={data.folders} timezone={data.timezone} state={data.state} selectedFolder={selectedFolder} initialView={initialView} dailyError={dailyError} initialHasMore={data.hasMore} />;
}
