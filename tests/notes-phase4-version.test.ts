import { describe, expect, it } from "vitest";
import { versionReviewPayloadSchema, canApplyReviewedNoteVersion } from "@/features/notes/versions/review";

describe("Notes owner-scoped version review guards", () => {
  it("rejects stale revisions and versions belonging to other notes", () => {
    const input = { expectedRevision: 7, actualRevision: 7, selectedVersionNoteId: "a", currentNoteId: "a" };
    expect(canApplyReviewedNoteVersion(input)).toBe(true);
    expect(canApplyReviewedNoteVersion({ ...input, actualRevision: 8 })).toBe(false);
    expect(canApplyReviewedNoteVersion({ ...input, selectedVersionNoteId: "other" })).toBe(false);
  });
  it("validates both current and historical bodies before displaying diff", () => {
    const history = {
      current: { title: "当前", body: "abc", revision: 3 },
      historical: { id: "59f1e8c9-9d19-4769-9f42-5e4f49c6a470", title: "历史",
        body: "xyz", versionNumber: 1, createdAt: "2026-11-05T08:00:00Z" },
    };
    expect(versionReviewPayloadSchema.safeParse(history).success).toBe(true);
    expect(versionReviewPayloadSchema.safeParse({ ...history, current: { title: "当前", body: 4, revision: 3 } }).success).toBe(false);
  });
});
