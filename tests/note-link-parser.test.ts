import { describe, expect, it } from "vitest";
import {
  internalNoteIdFromHref,
  parseInternalNoteLinkOccurrences,
  parseInternalNoteLinks,
  parseWikiNoteLinkOccurrences,
} from "@/features/notes/links/parser";
import { extractNoteLinkQuery } from "@/features/notes/editor/note-link-completion";
import { rankNoteLinkSuggestions } from "@/features/notes/links/ranking";

const alpha = "550e8400-e29b-41d4-a716-446655440000";
const beta = "550e8400-e29b-41d4-a716-446655440001";

describe("internal Note Markdown links", () => {
  it("parses canonical UUID links and removes duplicate targets", () => {
    const markdown = `[华夏](/notes/${alpha})\n[再次引用](/notes/${alpha})\n[规划](/notes/${beta})`;
    expect(parseInternalNoteLinks(markdown)).toEqual([alpha, beta]);
    expect(parseInternalNoteLinkOccurrences(markdown)).toHaveLength(3);
  });

  it("does not mistake external URLs, images, normal Markdown, or task checkboxes for Notes", () => {
    const markdown = `![image](/notes/${alpha})\n[网页](https://example.com/notes/${alpha})\n[普通链接](/files/${alpha})\n- [ ] task`;
    expect(parseInternalNoteLinks(markdown)).toEqual([]);
  });

  it("recognizes only a complete internal Note href", () => {
    expect(internalNoteIdFromHref(`/notes/${alpha}`)).toBe(alpha);
    expect(internalNoteIdFromHref(`/notes/${alpha}?x=1`)).toBeNull();
    expect(internalNoteIdFromHref(`https://example.com/notes/${alpha}`)).toBeNull();
  });
});

describe("hand-written Wiki Links", () => {
  it("preserves title, alias, and source range for backlink indexing", () => {
    const markdown = "See [[Alpha]] and [[Beta|显示名称]]";
    expect(parseWikiNoteLinkOccurrences(markdown)).toEqual([
      { targetTitle: "Alpha", label: "Alpha", from: 4, to: 13 },
      { targetTitle: "Beta", label: "显示名称", from: 18, to: 31 },
    ]);
  });
});

describe("[[ note completion token", () => {
  it("finds the active trigger and its replacement range", () => {
    expect(extractNoteLinkQuery("正文 [[华夏", 7)).toMatchObject({ from: 3, to: 7, query: "华夏" });
  });

  it("does not trigger for ordinary Markdown, task lists, images, or closed tokens", () => {
    expect(extractNoteLinkQuery("[文字](url)", 9)).toBeNull();
    expect(extractNoteLinkQuery("- [ ] task", 10)).toBeNull();
    expect(extractNoteLinkQuery("![image](url)", 13)).toBeNull();
    expect(extractNoteLinkQuery("[[华夏]] 后续", 9)).toBeNull();
  });
});

describe("Note link suggestion ranking", () => {
  it("uses exact, prefix, contains, then recent update order", () => {
    const notes = [
      { id: "1", title: "华夏基金实习记录", folderName: null, updatedAt: "2026-08-01T00:00:00Z" },
      { id: "2", title: "我的华夏学习", folderName: null, updatedAt: "2026-08-10T00:00:00Z" },
      { id: "3", title: "华夏", folderName: null, updatedAt: "2026-07-01T00:00:00Z" },
    ];
    expect(rankNoteLinkSuggestions(notes, "华夏").map((note) => note.id)).toEqual(["3", "1", "2"]);
  });

  it("finds non-contiguous title matches and prefers the tighter match", () => {
    const notes = [
      { id: "1", title: "产品规划复盘", folderName: null, updatedAt: "2026-08-11T00:00:00Z" },
      { id: "2", title: "产品需求规划", folderName: null, updatedAt: "2026-08-01T00:00:00Z" },
      { id: "3", title: "会议记录", folderName: null, updatedAt: "2026-08-10T00:00:00Z" },
    ];
    expect(rankNoteLinkSuggestions(notes, "产规").map((note) => note.id)).toEqual(["1", "2"]);
  });
});
