import { describe, expect, it } from "vitest";
import { clientMetricRoutes, isClientMetricName, normalizeMetricRoute, workspaceMetricRoute } from "@/lib/performance/client-metrics";

describe("private workspace performance metrics", () => {
  it("separates route commit from usable workspace data", () => {
    expect(isClientMetricName("route-commit")).toBe(true);
    expect(isClientMetricName("workspace-data-ready")).toBe(true);
    expect(isClientMetricName("navigation-ready")).toBe(false);
  });

  it("normalizes Career destinations without reporting record ids or search text", () => {
    for (const [href, expected] of [
      ["/career", "/career"],
      ["/career/experiences/private-id?search=private", "/career"],
      ["/career/interview/practice/private-id#answer", "/career/interview"],
      ["/notes/12345678-1234-1234-1234-123456789012?q=private", "/notes/[id]"],
    ]) {
      expect(normalizeMetricRoute(href)).toBe(expected);
      expect(clientMetricRoutes).toContain(expected);
    }
    expect(normalizeMetricRoute("/career-other/private")).toBeNull();
  });

  it("attributes resource readiness to the destination and ignores navigator-only reads", () => {
    expect(workspaceMetricRoute("notes")).toBe("/notes");
    expect(workspaceMetricRoute("today")).toBe("/today");
    expect(workspaceMetricRoute("notes-navigator")).toBeNull();
    expect(workspaceMetricRoute("private-title")).toBeNull();
  });
});
