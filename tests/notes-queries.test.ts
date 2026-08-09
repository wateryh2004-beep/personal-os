import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isNotesWorkspaceSchemaMissing } from "@/features/notes/queries";
import {
  excerptFromMarkdown,
  parseFallbackNoteListItems,
  parseNoteListItems,
} from "@/features/notes/listing";

const workspaceSource = readFileSync(
  "src/components/notes/notes-workspace.tsx",
  "utf8",
);

describe("Notes database compatibility", () => {
  it("recognizes missing Notes Workspace relations and columns", () => {
    expect(isNotesWorkspaceSchemaMissing({ code: "PGRST204" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "PGRST205" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "42703" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "PGRST202" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "42883" })).toBe(true);
  });

  it("does not disguise an authorization or network failure as a schema fallback", () => {
    expect(isNotesWorkspaceSchemaMissing({ code: "42501" })).toBe(false);
    expect(isNotesWorkspaceSchemaMissing(null)).toBe(false);
  });

  it("parses the RPC listing without retaining unexpected full-body fields", () => {
    const [note] = parseNoteListItems([
      {
        id: "20cbfbca-c1af-40aa-9796-7564f985f009",
        title: "测试笔记",
        excerpt: "轻量摘要",
        body_markdown: "不能跨过 RSC 边界的完整正文",
        updated_at: "2026-08-09T08:00:00.000Z",
        pinned_at: null,
        folder_id: null,
      },
    ]);
    expect(note).toEqual({
      id: "20cbfbca-c1af-40aa-9796-7564f985f009",
      title: "测试笔记",
      excerpt: "轻量摘要",
      updated_at: "2026-08-09T08:00:00.000Z",
      pinned_at: null,
      folder_id: null,
    });
    expect(note).not.toHaveProperty("body_markdown");
    expect(workspaceSource).not.toContain("body_markdown");
  });

  it("creates a bounded server-side excerpt in compatibility mode", () => {
    expect(
      excerptFromMarkdown("# 标题\n\n![图](https://example.com/image.png) **正文** [链接](https://example.com)"),
    ).toBe("标题 正文");
    const [note] = parseFallbackNoteListItems([
      {
        id: "20cbfbca-c1af-40aa-9796-7564f985f009",
        title: "兼容笔记",
        body_markdown: `# ${"长正文".repeat(100)}`,
        updated_at: "2026-08-09T08:00:00.000Z",
        pinned_at: null,
      },
    ]);
    expect(note.excerpt.length).toBeLessThanOrEqual(220);
    expect(note.folder_id).toBeNull();
    expect(note).not.toHaveProperty("body_markdown");
  });
});
