import { describe, expect, it } from "vitest";
import { notesListHref, recentNoteHref } from "./navigation";

describe("recentNoteHref", () => {
  it("restores a valid note id", () => {
    expect(recentNoteHref({ noteId: "123e4567-e89b-12d3-a456-426614174000" })).toBe("/notes/123e4567-e89b-12d3-a456-426614174000");
  });

  it("falls back for invalid snapshots", () => {
    expect(recentNoteHref({ noteId: "not-a-note" })).toBe("/notes");
  });
});

describe("notesListHref", () => {
  it("preserves a Notes list query context", () => {
    expect(notesListHref({ href: "/notes?folder=abc&q=rent&scope=all" })).toBe("/notes?folder=abc&q=rent&scope=all");
  });

  it("rejects editor and external routes", () => {
    expect(notesListHref({ href: "/notes/123e4567-e89b-12d3-a456-426614174000" })).toBe("/notes");
    expect(notesListHref({ href: "https://example.com/notes?folder=abc" })).toBe("/notes");
    expect(notesListHref({ href: "//example.com/notes" })).toBe("/notes");
  });
});
