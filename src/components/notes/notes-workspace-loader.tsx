"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { lastNotesListSessionKey, lastNotesListTtlMs } from "@/features/notes/navigation";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { WorkspaceReadError } from "@/components/shared/workspace-read-error";

function NotesShell() {
  return (
    <main aria-busy="true" className="h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pb-5 pt-14 sm:px-7 md:pt-[30px] lg:px-10">
      <div className="mx-auto max-w-[748px]">
        <div className="ui-skeleton-shimmer h-7 w-36 rounded-[8px]" />
        <div className="ui-skeleton-shimmer mt-5 h-9 w-full rounded-[10px]" />
        <div className="mt-4 space-y-px">
          <div className="ui-skeleton-shimmer h-[58px] rounded-[10px]" />
          <div className="ui-skeleton-shimmer h-[58px] rounded-[10px]" />
          <div className="ui-skeleton-shimmer h-[58px] rounded-[10px]" />
        </div>
      </div>
    </main>
  );
}

export function NotesWorkspaceLoader({ folderId, initialView, dailyError }: { folderId?: string; initialView: "all" | "favorites" | "recent"; dailyError: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const listHref = useMemo(() => `${pathname}${search ? `?${search}` : ""}`, [pathname, search]);
  const snapshot = useWorkspaceResource(notesWorkspaceResource, "notes");
  useEffect(() => {
    saveWorkspaceSession(lastNotesListSessionKey, { href: listHref }, lastNotesListTtlMs);
  }, [listHref]);

  const data = snapshot.data;
  if (!data && snapshot.error) return <WorkspaceReadError resource={notesWorkspaceResource} />;
  if (!data) return <NotesShell />;
  const selectedFolder = data.folders.find((folder) => folder.id === folderId) ?? null;
  return <NotesWorkspace notes={data.notes} folders={data.folders} timezone={data.timezone} state={data.state} selectedFolder={selectedFolder} initialView={initialView} dailyError={dailyError} initialHasMore={data.hasMore} />;
}
