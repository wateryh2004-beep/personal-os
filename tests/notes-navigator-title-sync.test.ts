import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNavigatorTitlePublisher,
  noteTitleNavigatorSyncDelayMs,
  patchNavigatorNoteTitle,
} from "@/features/notes/navigator-title-sync";

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

describe("nonblocking navigator title publisher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces individual keystrokes into one trailing tree update, including an empty title", () => {
    const notify = vi.fn();
    const publisher = createNavigatorTitlePublisher("note-a", notify);
    for (const title of ["标", "标题", "标题1", "标题12"]) {
      publisher.queue(title);
      vi.advanceTimersByTime(70);
      expect(notify).not.toHaveBeenCalled();
    }
    vi.advanceTimersByTime(noteTitleNavigatorSyncDelayMs - 1);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(notify).toHaveBeenCalledExactlyOnceWith("note-a", "标题12");
    publisher.queue("");
    vi.advanceTimersByTime(noteTitleNavigatorSyncDelayMs);
    expect(notify).toHaveBeenLastCalledWith("note-a", "");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("flushes the latest title on blur or unmount without a later duplicate", () => {
    const notify = vi.fn();
    const publisher = createNavigatorTitlePublisher("note-a", notify);
    publisher.queue("A");
    publisher.queue("AB");
    publisher.flush();
    publisher.flush();
    vi.advanceTimersByTime(noteTitleNavigatorSyncDelayMs * 2);
    expect(notify).toHaveBeenCalledExactlyOnceWith("note-a", "AB");
  });

  it("an AI title, undo or version restore cancels an older queued manual title", () => {
    const notify = vi.fn();
    const publisher = createNavigatorTitlePublisher("note-a", notify);
    publisher.queue("手动输入未结束");
    publisher.publishNow("AI 生成标题");
    vi.advanceTimersByTime(noteTitleNavigatorSyncDelayMs + 1);
    expect(notify).toHaveBeenCalledExactlyOnceWith("note-a", "AI 生成标题");
  });

  it("cancels pending events when explicitly discarded", () => {
    const notify = vi.fn();
    const publisher = createNavigatorTitlePublisher("note-a", notify);
    publisher.queue("不应同步");
    publisher.cancel();
    vi.runAllTimers();
    expect(notify).not.toHaveBeenCalled();
  });
});
