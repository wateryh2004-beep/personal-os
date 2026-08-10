import { describe, expect, it } from "vitest";
import { lastOpenedNoteTtlMs, recentNoteHref } from "@/features/notes/navigation";

describe("recent Notes navigation", () => {
  it("restores only a valid same-tab note identifier", () => {
    const noteId = "00000000-0000-4000-8000-000000000001";
    expect(recentNoteHref({ noteId })).toBe(`/notes/${noteId}`);
    expect(recentNoteHref({ noteId: "https://outside.example" })).toBe("/notes");
    expect(recentNoteHref(null)).toBe("/notes");
  });

  it("only remembers the most recent note for twenty minutes", () => {
    expect(lastOpenedNoteTtlMs).toBe(20 * 60 * 1_000);
  });
});
