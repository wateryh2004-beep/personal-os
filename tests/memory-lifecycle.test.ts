import { describe, expect, it } from "vitest";
import {
  getWorkingMemoryState,
  normalizeMemoryKey,
} from "@/features/memory/types";
describe("Personal Memory lifecycle", () => {
  const now = new Date("2026-08-08T00:00:00.000Z");
  it("normalizes stable memory identities without exposing user content", () => {
    expect(normalizeMemoryKey("profile", "  长期 工作 偏好 ")).toBe(
      "profile:长期 工作 偏好",
    );
  });
  it("never treats expired, stale, superseded, or archived working memory as current", () => {
    const base = {
      status: "active",
      archived_at: null,
      valid_until: null,
      review_at: null,
    };
    expect(getWorkingMemoryState(base, now)).toBe("active");
    expect(
      getWorkingMemoryState(
        { ...base, valid_until: "2026-08-07T00:00:00Z" },
        now,
      ),
    ).toBe("expired");
    expect(
      getWorkingMemoryState(
        { ...base, review_at: "2026-08-07T00:00:00Z" },
        now,
      ),
    ).toBe("needs_review");
    expect(getWorkingMemoryState({ ...base, status: "superseded" }, now)).toBe(
      "inactive",
    );
  });
});
