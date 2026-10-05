import { describe, expect, it } from "vitest";
import {
  backgroundWorkspacePrefetchTargets,
  isWorkspacePrefetchHref,
  shouldBackgroundWarmData,
  shouldSkipBackgroundPrefetch,
} from "@/lib/workspace-prefetch-policy";

describe("workspace prefetch policy", () => {
  it("warms the other primary workspaces while idle", () => {
    expect(backgroundWorkspacePrefetchTargets("/today")).toEqual(["/calendar", "/tasks", "/notes"]);
    expect(backgroundWorkspacePrefetchTargets("/calendar")).toEqual(["/today", "/tasks", "/notes"]);
    expect(backgroundWorkspacePrefetchTargets("/tasks")).toEqual(["/today", "/calendar", "/notes"]);
    expect(backgroundWorkspacePrefetchTargets("/notes/123")).toEqual(["/today", "/calendar", "/tasks"]);
    expect(backgroundWorkspacePrefetchTargets("/career")).toEqual(["/today", "/calendar", "/tasks", "/notes"]);
  });

  it("recognizes only workspace routes that have paired data resources", () => {
    expect(isWorkspacePrefetchHref("/today")).toBe(true);
    expect(isWorkspacePrefetchHref("/calendar")).toBe(true);
    expect(isWorkspacePrefetchHref("/tasks")).toBe(true);
    expect(isWorkspacePrefetchHref("/notes")).toBe(true);
    expect(isWorkspacePrefetchHref("/career")).toBe(false);
    expect(isWorkspacePrefetchHref("/notes/123")).toBe(false);
  });

  it("skips speculative work on constrained connections", () => {
    expect(shouldSkipBackgroundPrefetch({ saveData: true, effectiveType: "4g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "slow-2g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "2g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "3g" })).toBe(false);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "4g" })).toBe(false);
    expect(shouldSkipBackgroundPrefetch()).toBe(false);
  });

  it("uses background fetches only to fill a cold data cache", () => {
    expect(shouldBackgroundWarmData(undefined)).toBe(true);
    expect(shouldBackgroundWarmData(null)).toBe(false);
    expect(shouldBackgroundWarmData([])).toBe(false);
    expect(shouldBackgroundWarmData({})).toBe(false);
  });
});

describe("foreground-first workspace warming", () => {
  it("does not mistake an empty, not-yet-mounted workspace for an idle network", async () => {
    const { afterActiveWorkspaceRead } = await import("@/lib/workspace-prefetch-policy");
    const { createWorkspaceResource } = await import("@/lib/workspace-resource-cache");
    let resolve!: (data: string) => void;
    const resource = createWorkspaceResource("prefetch:foreground", () => new Promise<string>((done) => { resolve = done; }), 60_000);
    let schedules = 0;
    const cancel = afterActiveWorkspaceRead(resource, () => { schedules += 1; });
    expect(schedules).toBe(0);
    const read = resource.revalidate();
    expect(schedules).toBe(0);
    resolve("ready");
    await read;
    expect(schedules).toBe(1);
    resource.invalidate();
    expect(schedules).toBe(1);
    cancel();
  });

  it("waits for an active refresh even if stale data is present", async () => {
    const { afterActiveWorkspaceRead } = await import("@/lib/workspace-prefetch-policy");
    const { createWorkspaceResource } = await import("@/lib/workspace-resource-cache");
    let resolve!: (data: string) => void;
    const resource = createWorkspaceResource("prefetch:refresh", () => new Promise<string>((done) => { resolve = done; }), 60_000);
    resource.set("stale");
    const read = resource.revalidate({ force: true });
    let schedules = 0;
    afterActiveWorkspaceRead(resource, () => { schedules += 1; });
    expect(schedules).toBe(0);
    resolve("fresh");
    await read;
    expect(schedules).toBe(1);
  });

  it("cancels pending warming when navigation supersedes the workspace", async () => {
    const { afterActiveWorkspaceRead } = await import("@/lib/workspace-prefetch-policy");
    const { createWorkspaceResource } = await import("@/lib/workspace-resource-cache");
    const resource = createWorkspaceResource("prefetch:cancel", async () => "ready", 60_000);
    let schedules = 0;
    const cancel = afterActiveWorkspaceRead(resource, () => { schedules += 1; });
    cancel();
    await resource.revalidate();
    expect(schedules).toBe(0);
  });

  it("schedules once for already-warm resources and for settled failures", async () => {
    const { afterActiveWorkspaceRead } = await import("@/lib/workspace-prefetch-policy");
    const { createWorkspaceResource } = await import("@/lib/workspace-resource-cache");
    for (const failed of [false, true]) {
      const resource = createWorkspaceResource(`prefetch:settled:${failed}`, async () => { if (failed) throw new Error("offline"); return "ready"; }, 60_000);
      await resource.revalidate().catch(() => {});
      let schedules = 0;
      const cancel = afterActiveWorkspaceRead(resource, () => { schedules += 1; });
      expect(schedules).toBe(1);
      resource.invalidate();
      expect(schedules).toBe(1);
      cancel();
    }
  });

  it("maps nested workspace routes without gating unrelated server-owned pages", async () => {
    const { activeWorkspacePrefetchHref } = await import("@/lib/workspace-prefetch-policy");
    expect(activeWorkspacePrefetchHref("/today")).toBe("/today");
    expect(activeWorkspacePrefetchHref("/notes/123")).toBe("/notes");
    expect(activeWorkspacePrefetchHref("/career")).toBeUndefined();
    expect(activeWorkspacePrefetchHref("/notes-other")).toBeUndefined();
  });
});
