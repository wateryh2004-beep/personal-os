import { afterEach, describe, expect, it, vi } from "vitest";
import { workbenchEntityResource, inspectWorkbenchEntityCache } from "@/features/workbench/resource";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import type { WorkbenchReadResult, WorkbenchRef } from "@/features/workbench/contracts";
const ref: WorkbenchRef = { kind: "opportunity", id: "00000000-0000-4000-8000-000000000001" };
const result = (body = "JD"): WorkbenchReadResult => ({ status: "ready", entity: { ref, title: "岗位", href: "/career/opportunities", subtitle: null, fields: [], bodyMarkdown: body, sourceUrls: [], asOf: null } });
afterEach(() => { clearWorkspaceResources(); vi.unstubAllGlobals(); });
describe("workbench private resource budget", () => {
  it("retains an active oversize projection only until it unmounts", async () => {
    reconcileWorkspaceScope("owner", "v1");
    const resource = workbenchEntityResource(ref); const release = resource.subscribe(() => {});
    resource.set(result("中".repeat(2 * 1024 * 1024)));
    await Promise.resolve(); expect(resource.get().data?.status).toBe("ready"); expect(inspectWorkbenchEntityCache().bytes).toBeGreaterThan(inspectWorkbenchEntityCache().maximumBytes);
    release(); await Promise.resolve(); expect(resource.get().data).toBeUndefined(); expect(inspectWorkbenchEntityCache().bytes).toBeLessThanOrEqual(inspectWorkbenchEntityCache().maximumBytes);
  });
  it("detaches a previous owner's pending read before a new owner can publish", async () => {
    let resolve!: (response: Response) => void; vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    reconcileWorkspaceScope("old", "v1"); const resource = workbenchEntityResource(ref); const pending = resource.revalidate();
    reconcileWorkspaceScope("new", "v1"); resource.set(result("new owner")); resolve(Response.json({ results: [result("old owner")] }));
    await expect(pending).rejects.toThrow("superseded"); expect(resource.get().data).toEqual(result("new owner"));
  });
});
