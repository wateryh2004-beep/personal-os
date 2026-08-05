import { describe, expect, it } from "vitest";
import { contentHash, markdownFilename, noteFrontmatter, parseWikiLinks } from "@/features/notes/utils";
describe("Notes utilities", () => {
  it("parses Wiki Links and aliases", () => expect(parseWikiLinks("See [[Alpha]] and [[Beta|显示]]")).toMatchObject([{ targetTitle: "Alpha", alias: null }, { targetTitle: "Beta", alias: "显示" }]));
  it("creates stable content hashes", () => { expect(contentHash("a")).toBe(contentHash("a")); expect(contentHash("a")).not.toBe(contentHash("b")); });
  it("creates safe Markdown names and frontmatter", () => { expect(markdownFilename('a/b')).toBe("a-b.md"); expect(noteFrontmatter({ id: "id", title: "T", created_at: "2026-01-01", updated_at: "2026-01-02", body_markdown: "# body" })).toContain("title: \"T\""); });
});
