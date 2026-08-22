import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterNotesByMetadata, mergeNoteSearchResults, noteFolderPath } from "@/features/notes/local-search";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Notes experience contracts", () => {
  const folders = [
    { id: "work", name: "工作", parent_id: null },
    { id: "reits", name: "REITs", parent_id: "work" },
  ];
  const notes = [
    { id: "1", title: "凯德商业估值", folder_id: "reits" },
    { id: "2", title: "工作复盘", folder_id: "work" },
    { id: "3", title: "旅行计划", folder_id: null },
  ];

  it("finds and ranks local note metadata before waiting for full-text search", () => {
    expect(noteFolderPath("reits", folders)).toBe("工作 / REITs");
    expect(filterNotesByMetadata(notes, folders, "凯德").map((note) => note.id)).toEqual(["1"]);
    expect(filterNotesByMetadata(notes, folders, "工作 reits").map((note) => note.id)).toEqual(["1"]);
    expect(filterNotesByMetadata(notes, folders, "工作").map((note) => note.id)).toEqual(["2", "1"]);
  });

  it("merges immediate local hits with remote body hits without duplicates", () => {
    expect(mergeNoteSearchResults([notes[0]], [notes[0], notes[2]])).toEqual([notes[0], notes[2]]);
  });

  it("keeps library search interactive instead of turning each key into App Router navigation", () => {
    const workspace = source("src/components/notes/notes-workspace.tsx");
    expect(workspace).toContain("window.history.replaceState");
    expect(workspace).toContain("已先显示本地匹配");
    expect(workspace).toContain("mergeNoteSearchResults");
    expect(workspace).not.toContain('router.replace(`/notes?');
  });

  it("supports instant note switching from the persistent navigator", () => {
    const navigator = source("src/components/notes/notes-workspace-shell.tsx");
    expect(navigator).toContain("切换笔记…");
    expect(navigator).toContain("filterNotesByMetadata");
    expect(navigator).toContain("noteFolderPath");
    expect(navigator).toContain('event.key === "Escape"');
  });

  it("keeps crash recovery without serializing the whole draft on every keypress", () => {
    const editor = source("src/components/notes/note-editor.tsx");
    const policy = source("src/features/notes/editor/save-policy.ts");
    expect(policy).toContain("noteDraftRecoveryDebounceMs = 450");
    expect(editor).toContain("queueDraft(nextTitle, nextBody)");
    expect(editor).toContain("flushDraft();");
    expect(editor).toContain('window.addEventListener("pagehide", flush)');
    expect(editor).not.toContain("saveDraft(nextTitle, nextBody)");
  });

  it("keeps all title mutations synchronized with the persistent navigator", () => {
    const editor = source("src/components/notes/note-editor.tsx");
    expect(editor).toContain("publishNotesNavigatorTitle(note.id, nextTitle)");
    expect(editor).toContain("publishNotesNavigatorTitle(note.id, next)");
    expect(editor).toContain("publishNotesNavigatorTitle(note.id, prev)");
    expect(editor).toContain("publishNotesNavigatorTitle(note.id, draft.title)");
  });

  it("acknowledges the authoritative autosave before derived housekeeping", () => {
    const actions = source("src/features/notes/actions.ts");
    expect(actions).toContain('import { after } from "next/server"');
    expect(actions).toContain("const previousPromise = supabase");
    expect(actions).toContain("after(async () => {");
    expect(actions).toContain("const [linkSync, entityLinkSync] = await Promise.all");
    expect(actions.indexOf("const previousPromise = supabase")).toBeLessThan(actions.indexOf('.from("notes")\n    .update'));
  });
});
