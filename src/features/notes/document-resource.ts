"use client";

import { createWorkspaceResource, readWorkspaceResponse, workspaceBootstrapIsCurrent, workspaceOwnerIsCurrent, type WorkspaceBootstrap, type WorkspaceResource } from "@/lib/workspace-resource-cache";
import type { NoteDocumentData } from "./queries";
import type { NoteContinuity } from "./editor/continuity";

const maximumDocuments = 6;
const maximumBytes = 3 * 1024 * 1024;
type Slot = { resource: WorkspaceResource<NoteDocumentData | null>; active: number; position?: NoteContinuity };

/** A bounded tab-local family. No body or selection enters browser persistence. */
export function createNoteDocumentCache(read = (id: string, signal?: AbortSignal) => readWorkspaceResponse<NoteDocumentData | null>(`/api/notes/${encodeURIComponent(id)}/document`, signal)) {
  const slots = new Map<string, Slot>();
  const bytes = () => [...slots.values()].reduce((sum, slot) => {
    const note = slot.resource.get().data?.note;
    return sum + (note ? 2 * (note.body_markdown.length + note.title.length) : 0);
  }, 0);
  const trim = () => {
    for (const [id, slot] of slots) {
      if (slots.size <= maximumDocuments && bytes() <= maximumBytes) break;
      if (!slot.active && slot.resource.dispose?.()) slots.delete(id);
    }
  };
  const get = (id: string) => {
    const old = slots.get(id);
    if (old) { slots.delete(id); slots.set(id, old); return old.resource; }
    const slot: Slot = { active: 0, resource: undefined! };
    const base = createWorkspaceResource<NoteDocumentData | null>(`notes:document:${id}`, (signal) => read(id, signal), 45_000, {
      prefetchStrategy: "route-owned", onClear: () => { slot.position = undefined; },
    });
    slot.resource = { ...base,
      subscribe: (listener) => {
        slot.active += 1;
        const unsubscribe = base.subscribe(listener);
        return () => { unsubscribe(); slot.active -= 1; queueMicrotask(trim); };
      },
      set: (data) => { base.set(data); queueMicrotask(trim); },
      mutate: (update) => { base.mutate(update); queueMicrotask(trim); },
      revalidate: async (options) => { try { return await base.revalidate(options); } finally { queueMicrotask(trim); } },
    };
    slots.set(id, slot);
    // The caller subscribes after React commits; do not evict its new slot in render.
    queueMicrotask(trim);
    return slot.resource;
  };
  return {
    get,
    position: (id: string) => slots.get(id)?.position,
    remember: (id: string, position: NoteContinuity) => { const slot = slots.get(id); if (slot) slot.position = position; },
    saved: (id: string, snapshot: { title: string; body: string }, revision: number, lastSavedAt: string) => {
      slots.get(id)?.resource.mutate((data) => data && revision >= data.note.revision ? { ...data, note: { ...data.note, title: snapshot.title, body_markdown: snapshot.body, revision, last_saved_at: lastSavedAt, updated_at: lastSavedAt } } : data);
    },
    inspect: () => ({ count: slots.size, bytes: bytes() }),
  };
}
export const noteDocumentCache = createNoteDocumentCache();

/** Router history can retain an old Flight payload after the tab snapshot expires. */
export function reconcileNoteDocumentSeed(resource: WorkspaceResource<NoteDocumentData | null>, seed: WorkspaceBootstrap<NoteDocumentData | null>) {
  if (!workspaceOwnerIsCurrent(seed.ownerId)) return;
  if (!workspaceBootstrapIsCurrent(seed)) return resource.revalidate().catch(() => undefined);
  const current = resource.get();
  if (current.data && seed.data) {
    if (current.data.note.revision > seed.data.note.revision) return;
    // A higher authoritative revision beats wall-clock ordering and detaches old reads.
    if (seed.data.note.revision > current.data.note.revision) { resource.set(seed.data); return; }
  }
  if (current.promise || (current.fetchedAt ?? 0) > seed.generatedAt) return;
  resource.set(seed.data);
}
