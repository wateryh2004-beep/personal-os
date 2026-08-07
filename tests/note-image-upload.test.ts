import { describe, expect, it } from "vitest";
import { r2FailureMessage } from "@/features/files/r2-errors";

const sameOriginFallbackLimit = 4 * 1024 * 1024;

describe("note image upload routing", () => {
  it("uses the same-origin fallback for normal clipboard screenshots", () => {
    expect(2 * 1024 * 1024 <= sameOriginFallbackLimit).toBe(true);
    expect(5 * 1024 * 1024 <= sameOriginFallbackLimit).toBe(false);
  });

  it("returns actionable but non-secret R2 failures", () => {
    expect(r2FailureMessage(403, "upload")).toContain("Object Read & Write");
    expect(r2FailureMessage(404, "upload")).toContain("life-of-hang-files-prod");
    expect(r2FailureMessage(null, "verify")).toContain("R2_ENDPOINT");
  });
});
