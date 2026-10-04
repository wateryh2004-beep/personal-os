import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NoteReader, type NoteReaderData } from "@/components/notes/note-reader";
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: unknown }) => createElement("a", props, children as never) }));
const note: NoteReaderData = {
  id: "note-fixture", title: "Chosen conversation", bodyMarkdown: "# Original\n\n100−20−15=65 vs 90\n\n<script>alert(1)</script>\n[unsafe](javascript:alert(2))",
  revision: 2, sources: [{ source: "codex", sourceUrl: "https://example.test/chosen", savedAt: "2026-10-04" }],
  versions: [{ id: "version-fixture", versionNumber: 1, title: "Old title", bodyMarkdown: "Earlier original text" }],
};
describe("saved content reader", () => {
  it("renders chosen Markdown, source and retained snapshot with recovery access", () => {
    const html = renderToStaticMarkup(createElement(NoteReader, { note }));
    expect(html).toContain("100−20−15=65 vs 90");
    expect(html).toContain('href="https://example.test/chosen"');
    expect(html).toContain('href="/notes/note-fixture"');
    expect(html).toContain("Old title");
    expect(html).not.toContain("Earlier original text");
    expect(html).toContain("不代表其中的事实已经核验");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain(">unsafe</a>");
    expect(note.bodyMarkdown).toContain("<script>alert(1)</script>");
  });
  it("does not render unsafe source URLs", () => {
    const html = renderToStaticMarkup(createElement(NoteReader, { note: { ...note, sources: [{ source: "external_agent", sourceUrl: "javascript:alert(1)", savedAt: "2026-10-04" }] } }));
    expect(html).not.toContain("javascript:");
  });
});

describe("reader route shell integration", () => {
  it("uses the existing document identity for both reading and editing", async () => {
    const { noteDocumentId, isNotesWorkspacePath } = await import("@/features/notes/routes");
    const id = "10000000-0000-4000-8000-000000000001";
    expect(noteDocumentId(`/notes/${id}/read`)).toBe(id);
    expect(noteDocumentId(`/notes/${id}`)).toBe(id);
    expect(isNotesWorkspacePath(`/notes/${id}/read`)).toBe(true);
    expect(isNotesWorkspacePath("/notes")).toBe(true);
    expect(isNotesWorkspacePath("/notes/ask")).toBe(false);
    expect(isNotesWorkspacePath(`/notes/${id}/read/other`)).toBe(false);
  });
});
