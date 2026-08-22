import { describe, expect, it } from "vitest";
import { patchNavigatorNoteTitle } from "@/features/notes/navigator-title-sync";

describe("notes navigator live title sync", () => {
  const notes = [
    { id: "note-a", title: "旧标题", folder_id: null },
    { id: "note-b", title: "其他笔记", folder_id: "folder-1" },
  ];

  it("updates only the matching note while preserving other object references", () => {
    const next = patchNavigatorNoteTitle(notes, "note-a", "新标题");

    expect(next).not.toBe(notes);
    expect(next[0]).toEqual({ id: "note-a", title: "新标题", folder_id: null });
    expect(next[0]).not.toBe(notes[0]);
    expect(next[1]).toBe(notes[1]);
  });

  it("returns the existing array when no render-relevant change is needed", () => {
    expect(patchNavigatorNoteTitle(notes, "note-a", "旧标题")).toBe(notes);
    expect(patchNavigatorNoteTitle(notes, "missing-note", "新标题")).toBe(notes);
  });
});
