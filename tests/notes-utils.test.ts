import { describe, expect, it } from "vitest";
import { contentHash, formatNoteTimestamp, markdownFilename, noteFrontmatter, parseWikiLinks } from "@/features/notes/utils";
describe("Notes utilities", () => {
  it("parses Wiki Links and aliases", () => expect(parseWikiLinks("See [[Alpha]] and [[Beta|显示]]")).toMatchObject([{ targetTitle: "Alpha", alias: null }, { targetTitle: "Beta", alias: "显示" }]));
  it("creates stable content hashes", () => { expect(contentHash("a")).toBe(contentHash("a")); expect(contentHash("a")).not.toBe(contentHash("b")); });
  it("creates safe Markdown names and frontmatter", () => { expect(markdownFilename('a/b')).toBe("a-b.md"); expect(noteFrontmatter({ id: "id", title: "T", created_at: "2026-01-01", updated_at: "2026-01-02", body_markdown: "# body" })).toContain("title: \"T\""); });
  it("formats timestamps in the configured profile timezone, not the server timezone", () => {
    expect(formatNoteTimestamp("2026-08-06T00:30:00.000Z", "Asia/Shanghai")).toContain("08:30");
    expect(formatNoteTimestamp("not-a-date", "Asia/Shanghai")).toBe("时间未知");
  });
});
