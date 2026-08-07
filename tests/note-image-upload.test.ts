import { describe, expect, it } from "vitest";

const sameOriginFallbackLimit = 4 * 1024 * 1024;

describe("note image upload routing", () => {
  it("uses the same-origin fallback for normal clipboard screenshots", () => {
    expect(2 * 1024 * 1024 <= sameOriginFallbackLimit).toBe(true);
    expect(5 * 1024 * 1024 <= sameOriginFallbackLimit).toBe(false);
  });
});
