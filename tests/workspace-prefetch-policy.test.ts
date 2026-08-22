import { describe, expect, it } from "vitest";
import {
  backgroundWorkspacePrefetchTargets,
  shouldBackgroundWarmData,
  shouldSkipBackgroundPrefetch,
} from "@/lib/workspace-prefetch-policy";

describe("workspace prefetch policy", () => {
  it("warms only the most relevant adjacent workspaces", () => {
    expect(backgroundWorkspacePrefetchTargets("/today")).toEqual(["/calendar", "/tasks"]);
    expect(backgroundWorkspacePrefetchTargets("/calendar")).toEqual(["/today", "/tasks"]);
    expect(backgroundWorkspacePrefetchTargets("/tasks")).toEqual(["/today", "/calendar"]);
    expect(backgroundWorkspacePrefetchTargets("/notes/123")).toEqual(["/today"]);
    expect(backgroundWorkspacePrefetchTargets("/career")).toEqual(["/today"]);
  });

  it("skips speculative work on constrained connections", () => {
    expect(shouldSkipBackgroundPrefetch({ saveData: true, effectiveType: "4g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "slow-2g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "2g" })).toBe(true);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "3g" })).toBe(false);
    expect(shouldSkipBackgroundPrefetch({ effectiveType: "4g" })).toBe(false);
  });

  it("uses background fetches only to fill a cold data cache", () => {
    expect(shouldBackgroundWarmData(undefined)).toBe(true);
    expect(shouldBackgroundWarmData(null)).toBe(false);
    expect(shouldBackgroundWarmData([])).toBe(false);
    expect(shouldBackgroundWarmData({})).toBe(false);
  });
});
