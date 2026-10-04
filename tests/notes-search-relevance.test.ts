import { describe, expect, it } from "vitest";
import {
  filterNotesByMetadata,
  mergeNoteSearchResults,
  rankNoteSearchResults,
  splitNoteSearchHighlights,
} from "@/features/notes/local-search";
import { parseFallbackNoteListItems, searchExcerptFromMarkdown } from "@/features/notes/listing";

const folders = [{ id: "research", name: "研究", parent_id: null }];
const note = (id: string, title: string, folder_id: string | null = null, excerpt: string | null = null) => ({ id, title, folder_id, excerpt });

describe("Notes search relevance", () => {
  it("ranks remote titles ahead of local folder matches before applying the merged limit", () => {
    const local = [note("path", "每周记录", "research")];
    const remote = [note("body", "周一", null, "研究进展"), note("title", "研究方法"), note("exact", "研究")];
    expect(mergeNoteSearchResults(local, remote, 3, "研究", folders).map(({ id }) => id)).toEqual(["exact", "title", "path"]);
  });

  it("enriches a local duplicate with its matched snippet without changing local metadata", () => {
    const local = note("same", "研究新标题");
    const remote = note("same", "研究旧标题", "research", "…这段是实际研究命中…");
    expect(mergeNoteSearchResults([local], [remote], 50, "研究")).toEqual([{ ...local, excerpt: remote.excerpt }]);
    expect(local.excerpt).toBeNull();
    expect(mergeNoteSearchResults([local], [remote], 0)).toEqual([]);
  });

  it("retains stable ties and ranks title-token matches above path-only matches", () => {
    const input = [note("body", "日志"), note("second", "研究复盘"), note("first", "研究记录")];
    expect(rankNoteSearchResults(input, "研究").map(({ id }) => id)).toEqual(["second", "first", "body"]);
    expect(filterNotesByMetadata([note("path", "日志", "research"), note("title", "研究计划")], folders, "研究").map(({ id }) => id)).toEqual(["title", "path"]);
    expect(rankNoteSearchResults(input, " ")).toEqual(input);
  });
});

describe("Notes plain-text match highlights", () => {
  it.each([
    ["项目 ＲＥＩＴｓ 研究", "reits", "ＲＥＩＴｓ"],
    ["A cafe\u0301 plan", "CAFÉ", "cafe\u0301"],
    ["One oﬃce note", "office", "oﬃce"],
    ["前言 👩🏽‍💻 计划", "👩", "👩🏽‍💻"],
    ["研究 方法 研究", "研究 方法", "研究方法研究"],
  ])("preserves original Unicode text: %s", (text, query, matched) => {
    const parts = splitNoteSearchHighlights(text, query);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.matched).map((part) => part.text).join("")).toBe(matched);
  });

  it("treats regex characters and HTML as literal text, including overlaps", () => {
    const text = '<img src=x onerror="alert(1)"> C++ [a].*';
    const parts = splitNoteSearchHighlights(text, 'C++ [a].*');
    expect(parts.filter((part) => part.matched).map((part) => part.text)).toEqual(["C++", "[a].*"]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.every((part) => Object.keys(part).sort().join(",") === "matched,text")).toBe(true);
    expect(splitNoteSearchHighlights("ababa", "aba")).toEqual([{ text: "ababa", matched: true }]);
    expect(splitNoteSearchHighlights("内容", "  ")).toEqual([{ text: "内容", matched: false }]);
    expect(splitNoteSearchHighlights("", "内容")).toEqual([]);
  });
});

describe("Notes matched body excerpts", () => {
  it("shows a late body match with surrounding context rather than the opening paragraph", () => {
    const excerpt = searchExcerptFromMarkdown(`开头 ${"旧内容 ".repeat(200)}前文 **关键决策** 后文 ${"结束 ".repeat(100)}`, "关键决策");
    expect(excerpt).toContain("前文 关键决策 后文");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("开头");
    expect(excerpt.length).toBeLessThanOrEqual(220);
  });

  it.each([
    ["long body", "中文背景".repeat(100), "后续内容".repeat(100)],
    ["end of body", "中文背景".repeat(100), ""],
    ["short body", "中文背景".repeat(25), "后续"],
  ])("keeps the match within the first 25 characters on mobile: %s", (_name, before, after) => {
    const excerpt = searchExcerptFromMarkdown(`${before}实际命中${after}`, "实际命中");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.indexOf("实际命中")).toBeGreaterThanOrEqual(0);
    expect(excerpt.indexOf("实际命中")).toBeLessThanOrEqual(25);
    expect(excerpt.slice(0, 44)).toContain("实际命中");
    expect(excerpt.length).toBeLessThanOrEqual(220);
  });

  it("prefers the full query phrase and preserves searchable link labels and literal URLs", () => {
    const excerpt = searchExcerptFromMarkdown(`研究 ${"旧内容 ".repeat(100)} [研究 方法](https://example.test/ref) 后文`, "研究 方法");
    expect(excerpt).toContain("研究 方法");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(searchExcerptFromMarkdown("说明 [资料](https://example.test/unique_link)", "unique_link")).toContain("unique_link");
  });

  it("bounds empty, unmatched, and tiny excerpts without broken graphemes", () => {
    expect(searchExcerptFromMarkdown("", "研究")).toBe("");
    expect(searchExcerptFromMarkdown("# 简短 **正文**", "标题命中")).toBe("简短 正文");
    expect(searchExcerptFromMarkdown("abcdef", "不存在", 0)).toBe("");
    expect(searchExcerptFromMarkdown("abcdef", "不存在", 1)).toBe("…");
    const excerpt = searchExcerptFromMarkdown("👩🏽‍💻".repeat(40), "不存在", 30);
    expect(excerpt.length).toBeLessThanOrEqual(30);
    expect(excerpt.replace(/👩🏽‍💻/g, "")).toBe("…");
  });

  it("keeps search bodies server-side and preserves the legacy fallback API", () => {
    const input = [{ id: "20cbfbca-c1af-40aa-9796-7564f985f009", title: "日志", body_markdown: `${"旧内容 ".repeat(100)}实际命中`, updated_at: "2026-10-01", pinned_at: null }];
    const [searched] = parseFallbackNoteListItems(input, "实际命中");
    expect(searched.excerpt).toContain("实际命中");
    expect(searched).not.toHaveProperty("body_markdown");
    expect(parseFallbackNoteListItems(input)[0].excerpt).not.toContain("实际命中");
  });
});
