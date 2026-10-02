"use client";

import { useEffect, useRef, useState } from "react";
import type { NoteListItem } from "./types";
import { captureWorkspaceScope, clearWorkspaceResources, readWorkspaceResponse, WorkspaceAuthenticationError, WorkspaceReadSupersededError } from "@/lib/workspace-resource-cache";
import { clearWorkspaceSessions } from "@/lib/workspace-session";

type ListPage = { notes: NoteListItem[]; hasMore: boolean };
type Listing = ListPage & { key: string; source: NoteListItem[]; loaded: boolean; error: boolean; isCurrentScope: () => boolean };
// Bounded, same-tab metadata only. A scope lease makes an old owner's entries
// inaccessible synchronously, including before effects run after navigation.
const snapshots = new Map<string, Listing>();
function cachedListing(key: string) {
  for (const [entryKey, entry] of snapshots) if (!entry.isCurrentScope()) snapshots.delete(entryKey);
  return snapshots.get(key) ?? null;
}
function remember(listing: Listing) {
  if (!listing.isCurrentScope() || !listing.loaded) return;
  snapshots.delete(listing.key);
  snapshots.set(listing.key, listing);
  if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value!);
}
function listUrl(folderId: string | undefined, view: string, offset: number, limit = 50) {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (folderId) query.set("folderId", folderId);
  else if (view !== "all") query.set("view", view);
  return `/api/notes/list?${query}`;
}
async function readListPage(url: string, signal: AbortSignal) {
  const isCurrentScope = captureWorkspaceScope();
  try {
    const page = await readWorkspaceResponse<ListPage>(url, signal);
    if (!isCurrentScope()) throw new WorkspaceReadSupersededError("workspace_scope_changed");
    return page;
  } catch (error) {
    if (!signal.aborted && isCurrentScope() && error instanceof WorkspaceAuthenticationError) {
      snapshots.clear();
      clearWorkspaceResources();
      clearWorkspaceSessions();
      window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
    }
    throw error;
  }
}

export function useNotesListing({ notes, hasMore, folderId, view }: {
  notes: NoteListItem[]; hasMore: boolean; folderId?: string; view: "all" | "favorites" | "recent";
}) {
  const key = JSON.stringify([folderId ?? null, view]);
  const scoped = Boolean(folderId || view !== "all");
  const [listing, setListing] = useState<Listing | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ key: string; source: NoteListItem[] } | null>(null);
  const request = useRef<AbortController | null>(null);
  const current = listing?.key === key && listing.isCurrentScope() ? listing : cachedListing(key);
  const rows = current?.notes ?? (scoped ? [] : notes);
  const loaded = current?.loaded ?? !scoped;
  const more = current?.hasMore ?? (!scoped && hasMore);

  useEffect(() => {
    request.current?.abort();
    const retained = cachedListing(key);
    if (!scoped && (!retained || (retained.source === notes && !retained.error))) return () => request.current?.abort();
    const controller = new AbortController();
    const isCurrentScope = captureWorkspaceScope();
    request.current = controller;
    // Refresh the amount already displayed, not just its first page. This keeps
    // Back/Forward and a background workspace refresh from collapsing the list.
    const targetCount = Math.max(50, retained?.notes.length ?? 0);
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted || !isCurrentScope()) return;
      setPending({ key, source: notes });
      try {
        const fresh: NoteListItem[] = scoped ? [] : [...notes];
        let nextPage = scoped || hasMore;
        while (nextPage && fresh.length < targetCount) {
          const page = await readListPage(listUrl(folderId, view, fresh.length, Math.min(100, targetCount - fresh.length)), controller.signal);
          if (controller.signal.aborted || !isCurrentScope()) return;
          fresh.push(...page.notes);
          nextPage = page.hasMore && page.notes.length > 0;
        }
        const result: Listing = { notes: [...new Map(fresh.map((note) => [note.id, note])).values()], hasMore: nextPage, key, source: notes, loaded: true, error: false, isCurrentScope };
        remember(result);
        setListing(result);
      } catch {
        if (!controller.signal.aborted && isCurrentScope()) {
          const result: Listing = { notes: retained?.notes ?? [], hasMore: retained?.hasMore ?? false, key, source: notes, loaded: retained?.loaded ?? false, error: true, isCurrentScope };
          remember(result);
          setListing(result);
        }
      } finally {
        if (request.current === controller) { request.current = null; setPending(null); }
      }
    })();
    return () => { controller.abort(); request.current?.abort(); };
  }, [attempt, folderId, hasMore, key, notes, scoped, view]);

  const loadMore = async () => {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    const isCurrentScope = captureWorkspaceScope();
    request.current = controller;
    setPending({ key, source: notes });
    try {
      const page = await readListPage(listUrl(folderId, view, rows.length), controller.signal);
      if (controller.signal.aborted || !isCurrentScope()) return;
      const merged = new Map(rows.map((note) => [note.id, note]));
      page.notes.forEach((note) => merged.set(note.id, note));
      const result = { notes: [...merged.values()], hasMore: page.hasMore, key, source: notes, loaded: true, error: false, isCurrentScope };
      remember(result);
      setListing(result);
    } catch {
      if (!controller.signal.aborted && isCurrentScope()) {
        const result = { notes: rows, hasMore: more, key, source: notes, loaded, error: true, isCurrentScope };
        remember(result);
        setListing(result);
      }
    } finally {
      if (request.current === controller) { request.current = null; setPending(null); }
    }
  };
  const loading = pending?.key === key && pending.source === notes;
  return { notes: rows, hasMore: more, loaded, error: current?.error ?? false, loadingMore: loading, refreshing: loading && loaded, loadMore, retry: () => setAttempt((value) => value + 1) };
}
