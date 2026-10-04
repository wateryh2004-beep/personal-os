"use client";

import { useEffect, useState } from "react";
import type { NoteListItem } from "./types";
import { captureWorkspaceScope, clearWorkspaceResources, readWorkspaceResponse, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";
import { clearWorkspaceSessions } from "@/lib/workspace-session";

type SearchSnapshot = {
  key: string;
  results: NoteListItem[] | null;
  state: "idle" | "error";
  attempt: number;
  isCurrentScope: () => boolean;
};

// Same-tab search excerpts never enter persistent storage. The lease prevents
// an old owner's rows from being returned, even before navigation effects run.
const snapshots = new Map<string, SearchSnapshot>();
function cachedSearch(key: string) {
  for (const [entryKey, entry] of snapshots) if (!entry.isCurrentScope()) snapshots.delete(entryKey);
  return snapshots.get(key) ?? null;
}
function remember(snapshot: SearchSnapshot) {
  if (!snapshot.isCurrentScope() || snapshot.results === null) return;
  snapshots.delete(snapshot.key);
  snapshots.set(snapshot.key, snapshot);
  if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value!);
}

export function useNotesSearch(query: string, folderId?: string | null) {
  const normalizedQuery = query.trim();
  const activeFolderId = folderId ?? null;
  const key = JSON.stringify([activeFolderId, normalizedQuery]);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retained = normalizedQuery ? cachedSearch(key) : null;
  const current = snapshot?.key === key && snapshot.attempt === attempt && snapshot.isCurrentScope() ? snapshot : null;
  const results = normalizedQuery ? current?.results ?? retained?.results ?? null : null;
  const state = !normalizedQuery ? "idle" : current?.state ?? (retained ? "idle" : "loading");

  useEffect(() => {
    if (!normalizedQuery) return;
    const controller = new AbortController();
    const isCurrentScope = captureWorkspaceScope();
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted || !isCurrentScope()) return;
      try {
        const search = new URLSearchParams({ q: normalizedQuery, limit: "30" });
        if (activeFolderId) search.set("folderId", activeFolderId);
        const body = await readWorkspaceResponse<{ results?: NoteListItem[] }>(`/api/notes/search?${search}`, controller.signal);
        if (controller.signal.aborted || !isCurrentScope()) return;
        const fresh: SearchSnapshot = { key, results: body.results ?? [], state: "idle", attempt, isCurrentScope };
        remember(fresh);
        setSnapshot(fresh);
      } catch (error) {
        if (controller.signal.aborted || !isCurrentScope()) return;
        if (error instanceof WorkspaceAuthenticationError) {
          snapshots.clear();
          clearWorkspaceResources();
          clearWorkspaceSessions();
          // Force a render even when rows came only from the restored cache.
          // This revoked lease immediately hides them while the boundary exits.
          setSnapshot({ key, results: null, state: "error", attempt, isCurrentScope });
          window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
          return;
        }
        // A failed refresh must not collapse restored rows or their scroll area.
        setSnapshot({ key, results: cachedSearch(key)?.results ?? null, state: "error", attempt, isCurrentScope });
      }
    }, 160);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [activeFolderId, attempt, key, normalizedQuery]);

  return { results, state, retry: () => setAttempt((value) => value + 1) };
}
