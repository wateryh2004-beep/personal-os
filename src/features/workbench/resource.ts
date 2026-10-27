"use client";
import { createWorkspaceResource, readWorkspaceResponse, type WorkspaceCacheEntry, type WorkspaceResource } from "@/lib/workspace-resource-cache";
import { noteDocumentCache } from "@/features/notes/document-resource";
import type { NoteDocumentData } from "@/features/notes/queries";
import { workbenchRefKey, type WorkbenchReadResult, type WorkbenchRef } from "./contracts";
import { parseWorkspaceSceneListResponse } from "./scene-read-contracts";
const maximumEntries = 8;
const maximumBytes = 3 * 1024 * 1024;
type Slot = { resource: WorkspaceResource<WorkbenchReadResult>; active: number; bytes: number };
const entries = new Map<string, Slot>();
function trim() {
  let bytes = [...entries.values()].reduce((total, slot) => total + slot.bytes, 0);
  for (const [key, slot] of entries) {
    if (entries.size <= maximumEntries && bytes <= maximumBytes) break;
    if (!slot.active && slot.resource.dispose?.()) { entries.delete(key); bytes -= slot.bytes; }
  }
}
/** Notes reuse the existing 6-document/3MiB family, including its body and position budget. */
function noteResource(ref: WorkbenchRef): WorkspaceResource<WorkbenchReadResult> {
  const base = noteDocumentCache.get(ref.id);
  let previous: WorkspaceCacheEntry<NoteDocumentData | null> | undefined;
  let derived: WorkspaceCacheEntry<WorkbenchReadResult> = {};
  const project = (data: NoteDocumentData | null): WorkbenchReadResult => {
    if (!data || data.note.archived_at || data.note.deleted_at || data.note.status === "archived" || data.note.status === "trashed") return { status: "missing", ref };
    const pdf = data.attachments.find((file) => file.role === "primary_pdf" && file.mime_type === "application/pdf");
    return { status: "ready", entity: { ref, title: data.note.title, href: `/notes/${ref.id}`, subtitle: null, fields: [{ key: "updated", label: "更新", value: data.note.updated_at }], note: data.note, attachments: data.attachments, sourceUrls: [], asOf: data.note.updated_at, ...(pdf ? { pdf: { documentId: pdf.id, title: pdf.title } } : {}) } };
  };
  return {
    key: `workbench:note:${ref.id}`, subscribe: base.subscribe,
    get: () => { const current = base.get(); if (current !== previous) { previous = current; derived = { ...current, data: current.data === undefined ? undefined : project(current.data), promise: undefined }; } return derived; },
    revalidate: async (options) => project(await base.revalidate(options)),
    prefetch: async () => { const data = await base.prefetch(); return data === undefined ? undefined : project(data); },
    invalidate: base.invalidate,
    // This is a read projection of the Notes-owned resource; it cannot install a second truth.
    set: () => { throw new Error("readonly_note_projection"); }, mutate: () => { throw new Error("readonly_note_projection"); },
  };
}
/** Other authorized DTOs use a separate bounded UTF-16 budget; active oversize lives only while mounted. */
export function workbenchEntityResource(ref: WorkbenchRef) {
  if (ref.kind === "note") return noteResource(ref);
  const key = workbenchRefKey(ref);
  const existing = entries.get(key);
  if (existing) { entries.delete(key); entries.set(key, existing); return existing.resource; }
  const slot: Slot = { resource: undefined!, active: 0, bytes: 0 };
  const base = createWorkspaceResource<WorkbenchReadResult>(`workbench:${key}`, async (signal) => {
    const result = await readWorkspaceResponse<{ results: WorkbenchReadResult[] }>(`/api/workbench/entities?refs=${encodeURIComponent(JSON.stringify([ref]))}`, signal);
    return result.results[0];
  }, 20_000, { onClear: () => { slot.bytes = 0; } });
  const measure = () => { const data = base.get().data; slot.bytes = data ? JSON.stringify(data).length * 2 : 0; queueMicrotask(trim); };
  slot.resource = { ...base,
    subscribe: (listener) => { slot.active += 1; const unsubscribe = base.subscribe(listener); return () => { unsubscribe(); slot.active -= 1; queueMicrotask(trim); }; },
    revalidate: async (options) => { try { return await base.revalidate(options); } finally { measure(); } },
    set: (data) => { base.set(data); measure(); },
    mutate: (updater) => { base.mutate(updater); measure(); },
  };
  entries.set(key, slot); queueMicrotask(trim);
  return slot.resource;
}
export function inspectWorkbenchEntityCache() { return { count: entries.size, bytes: [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0), maximumBytes }; }

export const workspaceScenesResource = createWorkspaceResource("workbench:scenes", async (signal) => {
  const response = await readWorkspaceResponse<unknown>("/api/workbench/scenes", signal);
  return parseWorkspaceSceneListResponse(response);
}, 45_000);
