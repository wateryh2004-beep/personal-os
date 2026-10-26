import { describe, expect, it } from "vitest";
import { navigationTransitionType } from "@/components/layout/navigation-motion";

describe("navigation direction", () => {
  it("follows the shared visual registry in both directions", () => {
    expect(navigationTransitionType("/today", "/notes")).toBe("navigation-forward");
    expect(navigationTransitionType("/calendar?view=week", "/notes/10000000-0000-4000-8000-000000000001")).toBe("navigation-backward");
  });
  it("does not invent direction for local details, query changes or unknown routes", () => {
    expect(navigationTransitionType("/notes", "/notes/10000000-0000-4000-8000-000000000001")).toBeNull();
    expect(navigationTransitionType("/calendar?date=2026-10-26", "/calendar?date=2026-10-27")).toBeNull();
    expect(navigationTransitionType("/unknown", "/today")).toBeNull();
  });
});
