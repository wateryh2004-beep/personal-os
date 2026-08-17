"use client";

import { createWorkspaceResource } from "@/lib/workspace-resource-cache";
import type { NoteListItem } from "./types";

export type NotesWorkspaceData = {
  notes: NoteListItem[];
  folders: { id: string; name: string; parent_id: string | null }[];
  timezone: string;
  state: "ready" | "base" | "unavailable";
  hasMore: boolean;
};

async function readNotesWorkspace(): Promise<NotesWorkspaceData> {
  const response = await fetch("/api/notes/workspace", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as NotesWorkspaceData & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "notes_workspace_unavailable");
  return body;
}

export const notesWorkspaceResource = createWorkspaceResource(
  "notes:workspace-data",
  readNotesWorkspace,
  45_000,
);
