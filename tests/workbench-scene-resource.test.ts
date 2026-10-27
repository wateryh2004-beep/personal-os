// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearWorkspaceResources, WorkspaceReadSupersededError } from "@/lib/workspace-resource-cache";
import { workspaceScenesResource } from "@/features/workbench/resource";
const row = { id: "20000000-0000-4000-8000-000000000001", name: "可恢复合成现场", revision: 1, created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z", archived_at: null, snapshot: { version: 1, main: { href: "/notes" }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" } } };
const unknown = { ...row, id: "20000000-0000-4000-8000-000000000002", snapshot: { version: 4, privateBody: "PRIVATE FUTURE BODY" } };
beforeEach(() => clearWorkspaceResources());
afterEach(() => { clearWorkspaceResources(); vi.unstubAllGlobals(); });
it("reads old and mixed legacy envelopes through the real bounded GET resource", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ scenes: [row] })).mockResolvedValueOnce(Response.json({ scenes: [row, unknown] })); vi.stubGlobal("fetch", fetcher);
  expect(await workspaceScenesResource.revalidate()).toEqual({ scenes: [row] });
  const mixed = await workspaceScenesResource.revalidate({ force: true });
  expect(mixed.scenes).toEqual([row]); expect(mixed.unsupportedScenes?.[0]).toMatchObject({ id: unknown.id, revision: 1 });
  expect(JSON.stringify(workspaceScenesResource.get().data)).not.toContain("PRIVATE FUTURE BODY");
  expect(fetcher.mock.calls[0][0]).toBe("/api/workbench/scenes"); expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" }); expect(fetcher.mock.calls[0][1].method).toBeUndefined();
});
it("replaces a same-ID same-revision supported row with metadata when its snapshot becomes unsupported", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ scenes: [row] })).mockResolvedValueOnce(Response.json({ scenes: [{ ...row, snapshot: unknown.snapshot }] })); vi.stubGlobal("fetch", fetcher);
  await workspaceScenesResource.revalidate(); const current = await workspaceScenesResource.revalidate({ force: true });
  expect(current.scenes).toEqual([]); expect(current.unsupportedScenes?.[0]).toMatchObject({ id: row.id, revision: row.revision });
  expect(JSON.stringify(current)).not.toContain("snapshot");
});
it("keeps valid rows while reporting malformed metadata and rejecting payloads smuggled into metadata DTOs", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scenes: [row, { ...unknown, name: "" }], unsupportedScenes: [{ ...unknown }] })));
  expect(await workspaceScenesResource.revalidate()).toEqual({ scenes: [row], unavailableCount: 2 });
  expect(JSON.stringify(workspaceScenesResource.get().data)).not.toContain("PRIVATE FUTURE BODY");
});
it("clears scope and refuses an old owner's delayed mixed result", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(done => { resolve = done; })).mockResolvedValueOnce(Response.json({ scenes: [] })); vi.stubGlobal("fetch", fetcher);
  const old = workspaceScenesResource.revalidate(); const rejection = expect(old).rejects.toBeInstanceOf(WorkspaceReadSupersededError);
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  clearWorkspaceResources(); expect(signal.aborted).toBe(true); expect(await workspaceScenesResource.revalidate()).toEqual({ scenes: [] });
  resolve(Response.json({ scenes: [row, unknown] })); await rejection;
  expect(workspaceScenesResource.get().data).toEqual({ scenes: [] });
});
it.each([401, 403, 503])("does not turn HTTP %s into successful compatibility metadata", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scenes: [row, unknown] }, { status })));
  await expect(workspaceScenesResource.revalidate()).rejects.toThrow(); expect(workspaceScenesResource.get().data).toBeUndefined();
});
