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
