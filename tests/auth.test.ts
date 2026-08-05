import { describe, expect, it } from "vitest";
import { isOwnerEmail } from "@/lib/auth/owner";

describe("isOwnerEmail", () => {
  it("allows the configured owner regardless of casing", () => {
    expect(isOwnerEmail("OWNER@example.com", "owner@example.com")).toBe(true);
  });

  it("rejects a non-owner", () => {
    expect(isOwnerEmail("other@example.com", "owner@example.com")).toBe(false);
  });

  it("fails closed when the owner is not configured", () => {
    expect(isOwnerEmail("owner@example.com", undefined)).toBe(false);
  });
});
