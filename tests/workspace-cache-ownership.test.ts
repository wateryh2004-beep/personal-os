// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceResources, createWorkspaceResource, readWorkspaceResponse,
  reconcileWorkspaceScope, WorkspaceAuthenticationError,
} from "@/lib/workspace-resource-cache";
import { loadWorkspaceSession, reconcileWorkspaceSessionOwner, saveWorkspaceSession } from "@/lib/workspace-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
afterEach(() => { clearWorkspaceResources(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("authoritative workspace ownership", () => {
  it("a local mutation alone detaches an older read, including its caller", async () => {
    const old = deferred<{ version: number }>();
    const resource = createWorkspaceResource("mutation-only", () => old.promise, 0);
    resource.set({ version: 1 });
    const pending = resource.revalidate();
    resource.mutate(() => ({ version: 2 }));
    old.resolve({ version: 1 });
    await expect(pending).rejects.toThrow("workspace_read_superseded");
    expect(resource.get().data).toEqual({ version: 2 });
  });

  it("shares one cold read between intent, list, navigator and active consumer", async () => {
    const request = deferred<string>();
    const fetcher = vi.fn(() => request.promise);
    const resource = createWorkspaceResource("single-flight", fetcher, 45_000);
    const pending = [resource.prefetch(), resource.revalidate(), resource.revalidate({ force: true })];
    expect(fetcher).toHaveBeenCalledTimes(1);
    request.resolve("fresh");
    await Promise.all(pending);
    await resource.prefetch();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("an acknowledged server revision detaches prefetch and refreshes active resources only", async () => {
    reconcileWorkspaceScope("revision-owner", "before");
    const old = deferred<string>();
    const fresh = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const resource = createWorkspaceResource<string>("revision-active", fetcher, 60_000);
    const inactiveRead = vi.fn().mockResolvedValue("inactive-new");
    const inactive = createWorkspaceResource("revision-inactive", inactiveRead, 60_000);
    resource.set("saved-local");
    inactive.set("inactive-old");
    const unsubscribe = resource.subscribe(() => {});
    const oldRequest = resource.revalidate({ force: true });
    reconcileWorkspaceScope("revision-owner", "after");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(inactiveRead).not.toHaveBeenCalled();
    expect(inactive.get().staleAt).toBe(0);
    expect(resource.get().data).toBe("saved-local");
    old.resolve("obsolete");
    await expect(oldRequest).rejects.toThrow("workspace_read_superseded");
    fresh.resolve("authoritative");
    await resource.revalidate();
    expect(resource.get().data).toBe("authoritative");
    unsubscribe();
  });

  it("clears old-owner snapshots before new-owner reads and ignores late old 401s", async () => {
    reconcileWorkspaceScope("owner-a", "a");
    const old = deferred<string>();
    const resource = createWorkspaceResource("isolation", () => old.promise, 0);
    const oldRead = resource.revalidate();
    reconcileWorkspaceScope("owner-b", "b");
    expect(resource.get().data).toBeUndefined();
    resource.set("owner-b-private");
    old.reject(new WorkspaceAuthenticationError("expired-a"));
    await expect(oldRead).rejects.toThrow("expired-a");
    expect(resource.get().data).toBe("owner-b-private");
  });

  it("a current unauthorized response purges every private resource and draft", async () => {
    const resource = createWorkspaceResource("auth-failure", async () => { throw new WorkspaceAuthenticationError("expired"); }, 0);
    const other = createWorkspaceResource("other-private", async () => "unused", 0);
    other.set("private");
    saveWorkspaceSession("draft", "private draft");
    await expect(resource.revalidate()).rejects.toThrow("expired");
    expect(other.get().data).toBeUndefined();
    expect(loadWorkspaceSession("draft")).toBeNull();
  });

  it("preserves same-owner recovery on reload and evicts it on an identity change", () => {
    reconcileWorkspaceSessionOwner("a");
    saveWorkspaceSession("draft", { text: "unfinished" });
    reconcileWorkspaceSessionOwner("a");
    expect(loadWorkspaceSession("draft")).toEqual({ text: "unfinished" });
    reconcileWorkspaceSessionOwner("b");
    expect(loadWorkspaceSession("draft")).toBeNull();
  });

  it.each([401, 403])("recognizes HTTP %s without parsing a private payload", async (status) => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, ok: false, json }));
    await expect(readWorkspaceResponse("/api/tasks/workspace")).rejects.toBeInstanceOf(WorkspaceAuthenticationError);
    expect(json).not.toHaveBeenCalled();
  });
});
