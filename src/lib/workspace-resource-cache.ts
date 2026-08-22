"use client";

import { useEffect } from "react";

/**
 * Minimal per-tab cache for already-authorized workspace read models.
 *
 * Private data intentionally stays in memory only: it is neither persisted to
 * localStorage nor placed in a shared HTTP/CDN cache. A single in-flight read
 * is shared by the active workspace consumer and explicit revalidation.
 */
export type WorkspaceCacheEntry<T> = {
  data?: T;
  fetchedAt?: number;
  staleAt?: number;
  promise?: Promise<T>;
  error?: Error;
};

type Listener = () => void;
type WorkspacePrefetchStrategy = "network" | "route-owned";

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

const resources = new Set<{ clear: () => void }>();

export function createWorkspaceResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  staleMs: number,
  options: { prefetchStrategy?: WorkspacePrefetchStrategy } = {},
): WorkspaceResource<T> {
  let entry: WorkspaceCacheEntry<T> = {};
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((listener) => listener());

  const revalidate = async ({ force = false }: { force?: boolean } = {}) => {
    const now = Date.now();
    if (!force && entry.data !== undefined && (entry.staleAt ?? 0) > now) return entry.data;
    if (entry.promise) return entry.promise;

    const request = fetcher()
      .then((data) => {
        // Do not clear data while revalidating; stale UI remains useful.
        if (entry.promise === request) {
          entry = { data, fetchedAt: Date.now(), staleAt: Date.now() + staleMs };
          notify();
        }
        return data;
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error("workspace_read_failed");
        if (entry.promise === request) {
          entry = { ...entry, promise: undefined, error };
          notify();
        }
        throw error;
      });
    entry = { ...entry, promise: request, error: undefined };
    notify();
    return request;
  };

  const resource: WorkspaceResource<T> = {
    key,
    get: () => entry,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    set: (data) => { entry = { data, fetchedAt: Date.now(), staleAt: Date.now() + staleMs }; notify(); },
    mutate: (updater) => { entry = { ...entry, data: updater(entry.data) }; notify(); },
    invalidate: () => { entry = { ...entry, staleAt: 0 }; notify(); },
    // Route-owned workspaces are already fetched by Next.js RSC prefetch. A
    // second API prefetch only duplicates Vercel ↔ Supabase work.
    prefetch: options.prefetchStrategy === "route-owned"
      ? async () => entry.data
      : () => revalidate(),
    revalidate,
  };
  resources.add({ clear: () => { entry = {}; notify(); } });
  return resource;
}

export function clearWorkspaceResources() {
  resources.forEach((resource) => resource.clear());
}

/** Revalidate only the mounted (therefore active) workspace after focus/reconnect. */
export function useWorkspaceResourceLifecycle<T>(resource: WorkspaceResource<T>) {
  useEffect(() => {
    const revalidate = () => { void resource.revalidate().catch(() => {}); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, [resource]);
}
