"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { perfMark, perfMeasureWorkspaceReady } from "@/lib/perf";
import { clearWorkspaceSessions, reconcileWorkspaceSessionOwner } from "@/lib/workspace-session";

/** Authorized read models live in this tab only, never in storage or a CDN. */
export type WorkspaceCacheEntry<T> = {
  data?: T;
  fetchedAt?: number;
  staleAt?: number;
  promise?: Promise<T>;
  error?: Error;
};
type Listener = () => void;
export type WorkspaceResource<T> = {
  key: string;
  get: () => WorkspaceCacheEntry<T>;
  subscribe: (listener: Listener) => () => void;
  set: (data: T) => void;
  mutate: (updater: (current: T | undefined) => T | undefined) => void;
  invalidate: () => void;
  prefetch: () => Promise<T | undefined>;
  revalidate: (options?: { force?: boolean }) => Promise<T>;
};

export class WorkspaceAuthenticationError extends Error {}
export class WorkspaceReadSupersededError extends Error {}

/** An HTTP read may never interpret a login page/error as workspace data. */
export async function readWorkspaceResponse<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal });
  if (response.status === 401 || response.status === 403) throw new WorkspaceAuthenticationError("需要重新登录。");
  if (!response.ok) throw new Error("工作区暂时无法读取，请重试。");
  return response.json() as Promise<T>;
}

const resources = new Set<{ clear: () => void; invalidate: () => void; refreshActive: () => void }>();
let ownerScope: string | undefined;
let scopeEpoch = 0;
let serverRevision: string | undefined;

export function createWorkspaceResource<T>(
  key: string,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  staleMs: number,
  options: { prefetchStrategy?: "network" | "route-owned" } = {},
): WorkspaceResource<T> {
  let entry: WorkspaceCacheEntry<T> = {};
  let controller: AbortController | undefined;
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((listener) => listener());
  const detach = () => { controller?.abort(); controller = undefined; };

  const revalidate = async ({ force = false }: { force?: boolean } = {}) => {
    if (!force && entry.data !== undefined && (entry.staleAt ?? 0) > Date.now()) return entry.data;
    if (entry.promise) return entry.promise;
    controller = new AbortController();
    const request = fetcher(controller.signal)
      .then((data) => {
        // Callers (including calendar ranges) must not consume a superseded
        // response either. Checking only the cache write is insufficient.
        if (entry.promise !== request) throw new WorkspaceReadSupersededError("workspace_read_superseded");
        entry = { data, fetchedAt: Date.now(), staleAt: Date.now() + staleMs };
        controller = undefined;
        notify();
        return data;
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error("workspace_read_failed");
        if (entry.promise === request) {
          if (error instanceof WorkspaceAuthenticationError) {
            // Only a current request can revoke this cache scope. An old
            // owner's rejected request must not evict a newer owner's data.
            clearWorkspaceResources();
            clearWorkspaceSessions();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
          }
          entry = { ...entry, promise: undefined, error };
          controller = undefined;
          notify();
        }
        throw error;
      });
    entry = { ...entry, promise: request, error: undefined };
    notify();
    return request;
  };

  const invalidate = () => { detach(); entry = { ...entry, staleAt: 0, promise: undefined }; notify(); };
  const resource: WorkspaceResource<T> = {
    key,
    get: () => entry,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    set: (data) => { detach(); entry = { data, fetchedAt: Date.now(), staleAt: Date.now() + staleMs }; notify(); },
    mutate: (updater) => {
      detach();
      entry = { ...entry, data: updater(entry.data), promise: undefined };
      notify();
    },
    invalidate,
    prefetch: options.prefetchStrategy === "route-owned" ? async () => entry.data : () => revalidate(),
    revalidate,
  };
  resources.add({
    clear: () => { detach(); entry = {}; notify(); },
    invalidate,
    refreshActive: () => { if (listeners.size) void revalidate().catch(() => {}); },
  });
  return resource;
}

export function clearWorkspaceResources() {
  scopeEpoch += 1;
  ownerScope = undefined;
  serverRevision = undefined;
  resources.forEach((resource) => resource.clear());
}

/** Called at the authenticated layout boundary; never used to authorize reads. */
export function reconcileWorkspaceScope(ownerId: string, revision: string) {
  if (ownerScope !== ownerId) {
    clearWorkspaceResources();
    reconcileWorkspaceSessionOwner(ownerId);
    ownerScope = ownerId;
    serverRevision = revision;
  } else if (serverRevision !== revision) {
    serverRevision = revision;
    // Detach all old reads before starting any new reads. Keep mounted editors
    // and their unsaved inputs in place while fresh records reconcile.
    resources.forEach((resource) => resource.invalidate());
    resources.forEach((resource) => resource.refreshActive());
  }
}

export function useWorkspaceResourceLifecycle<T>(resource: WorkspaceResource<T>) {
  useEffect(() => {
    const revalidate = () => { void resource.revalidate().catch(() => {}); };
    revalidate();
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, [resource]);
}

const emptyServerSnapshot = {};
/** SSR must never observe a browser's module-level in-memory data. */
export function useWorkspaceResource<T>(resource: WorkspaceResource<T>, name: string) {
  const snapshot = useSyncExternalStore(resource.subscribe, resource.get, () => emptyServerSnapshot as WorkspaceCacheEntry<T>);
  const visible = useRef(false);
  useWorkspaceResourceLifecycle(resource);
  useEffect(() => {
    if (snapshot.data === undefined || visible.current) return;
    visible.current = true;
    perfMark("workspace-visible", { workspace: name, source: "tab-resource" });
    perfMeasureWorkspaceReady({ workspace: name });
  }, [name, snapshot.data]);
  return snapshot;
}

/** Capture before asynchronous local work so old-owner callbacks cannot publish. */
export function captureWorkspaceScope() {
  const epoch = scopeEpoch;
  return () => epoch === scopeEpoch;
}

export function useWorkspaceResourceLease<T>(resource: WorkspaceResource<T>): WorkspaceResource<T> {
  const epoch = scopeEpoch;
  return useMemo(() => {
    const current = () => epoch === scopeEpoch;
    return {
      ...resource,
      set: (data: T) => { if (current()) resource.set(data); },
      mutate: (updater: (value: T | undefined) => T | undefined) => { if (current()) resource.mutate(updater); },
      invalidate: () => { if (current()) resource.invalidate(); },
      prefetch: () => current() ? resource.prefetch() : Promise.resolve(undefined),
      revalidate: (options?: { force?: boolean }) => current() ? resource.revalidate(options) : Promise.reject(new WorkspaceReadSupersededError("workspace_scope_changed")),
    };
  }, [epoch, resource]);
}
