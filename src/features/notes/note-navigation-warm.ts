"use client";

import { captureWorkspaceScope, hasWorkspaceOwnerScope } from "@/lib/workspace-resource-cache";
import { shouldSkipBackgroundPrefetch } from "@/lib/workspace-prefetch-policy";

// A short dwell avoids one network request per item as the pointer crosses the
// navigator. Only one queued intent and at most two active document reads.
const dwellMs = 150;
const maximumConcurrentReads = 2;
let pendingId: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let activeReads = 0;
const activeIds = new Set<string>();

type Connection = { saveData?: boolean; effectiveType?: string };
type NavigatorWithConnection = Navigator & { connection?: Connection };

export function mayWarmNoteOnIntent() {
  if (typeof document === "undefined" || typeof navigator === "undefined") return false;
  if (document.visibilityState !== "visible" || !hasWorkspaceOwnerScope()) return false;
  return !shouldSkipBackgroundPrefetch((navigator as NavigatorWithConnection).connection);
}

async function warm(id: string) {
  if (!mayWarmNoteOnIntent() || activeIds.has(id) || activeReads >= maximumConcurrentReads) return;
  const isCurrentScope = captureWorkspaceScope();
  activeIds.add(id);
  activeReads += 1;
  try {
    // Do not ship the document cache's reader with every notes-list visit.
    const { noteDocumentCache } = await import("@/features/notes/document-resource");
    if (!isCurrentScope() || !mayWarmNoteOnIntent()) return;
    await noteDocumentCache.warm(id);
  } catch {
    // Navigation still owns the eventual authenticated read and its error UI.
  } finally {
    activeIds.delete(id);
    activeReads -= 1;
  }
}

/** Called only from a real pointer dwell or a keyboard focus intent. */
export function scheduleNoteNavigationWarm(id: string, immediate = false) {
  if (!mayWarmNoteOnIntent()) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingId = id;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (pendingId !== id) return;
    pendingId = null;
    void warm(id);
  }, immediate ? 0 : dwellMs);
}

export function cancelNoteNavigationWarm(id: string) {
  if (pendingId !== id) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingId = null;
  pendingTimer = null;
}
