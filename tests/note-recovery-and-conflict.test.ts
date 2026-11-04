// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { canApplyNoteConflictMerge, parseRemoteNoteDocument } from "@/features/notes/editor/conflict-resolution";

afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("same-tab Notes crash recovery", () => {
  it("returns true only when the recovery snapshot was actually stored", () => {
    expect(saveWorkspaceSession("note-test", { title: "A" }, 100_000)).toBe(true);
    expect(loadWorkspaceSession<{ title: string }>("note-test")).toEqual({ title: "A" });
  });
  it("reports unavailable storage instead of silently claiming recovery", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    expect(saveWorkspaceSession("note-quota", { body: "未保存内容" })).toBe(false);
  });
});

describe("version conflict merge guard", () => {
  const base = {
    localNow: { title: "草稿", body: "new" },
    localWhenOpened: { title: "草稿", body: "new" },
    localRevision: 4,
    knownRemoteRevision: 5,
    selectedRemoteRevision: 5,
    saveInProgress: false,
  };
  it("accepts a reviewed snapshot and rejects stale, edited, or in-flight merges", () => {
    expect(canApplyNoteConflictMerge(base)).toBe(true);
    expect(canApplyNoteConflictMerge({ ...base, selectedRemoteRevision: 4 })).toBe(false);
    expect(canApplyNoteConflictMerge({ ...base, localNow: { title: "changed", body: "new" } })).toBe(false);
    expect(canApplyNoteConflictMerge({ ...base, saveInProgress: true })).toBe(false);
  });
  it("accepts only well-formed, nonnegative cloud revisions", () => {
    expect(parseRemoteNoteDocument({ note: { title: "云端", body_markdown: "text", revision: 6 } })).toEqual({ title: "云端", body: "text", revision: 6 });
    expect(parseRemoteNoteDocument({ note: { title: "云端", body_markdown: "text", revision: "6" } })).toBeNull();
    expect(parseRemoteNoteDocument({ note: { title: "云端", body_markdown: "text", revision: -1 } })).toBeNull();
  });
});
