"use client";

import { createWorkspaceResource, readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { NoteListItem } from "./types";

export type NotesWorkspaceData = {
  notes: NoteListItem[];
  navigatorNotes: { id: string; title: string; folder_id: string | null; updated_at: string; content_origin: string | null }[];
  folders: { id: string; name: string; parent_id: string | null }[];
  timezone: string;
  state: "ready" | "base" | "unavailable";
  hasMore: boolean;
};

async function readNotesWorkspace(signal?: AbortSignal): Promise<NotesWorkspaceData> {
  return readWorkspaceResponse<NotesWorkspaceData>("/api/notes/workspace", signal);
}

export const notesWorkspaceResource = createWorkspaceResource(
  "notes:workspace-data",
  readNotesWorkspace,
  45_000,
  { prefetchStrategy: "route-owned" },
);
