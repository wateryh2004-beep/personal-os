import { describe, expect, it } from "vitest";
import { noteReferenceMarkdown, relatedWorkFromNote } from "@/features/notes/links/reference";
import { parseInternalNoteLinks } from "@/features/notes/links/parser";
import { parseInternalEntityLinks } from "@/features/links/parser";

const id = "00000000-0000-4000-8000-000000000001";

describe("reusable Notes references", () => {
  it("copies stable entity links rather than title-based wiki links", () => {
    expect(noteReferenceMarkdown("研究笔记", `/notes/${id}`)).toBe(`[研究笔记](/notes/${id})`);
    expect(noteReferenceMarkdown("跟进", `/tasks?task=${id}`)).toBe(`[跟进](/tasks?task=${id})`);
    expect(noteReferenceMarkdown("", `/notes/${id}`)).toBe(`[无标题笔记](/notes/${id})`);
  });

  it("preserves exact reference identity for titles containing Markdown punctuation", () => {
    const markdown = noteReferenceMarkdown("[版本] *重点* & <对比>\n第二行", `/notes/${id}`);
    expect(markdown).not.toContain("\n");
    expect(parseInternalNoteLinks(markdown)).toEqual([id]);
    expect(parseInternalEntityLinks(markdown)).toHaveLength(1);
    expect(markdown).toContain("&#91;版本&#93;");
  });

  it("rejects external and ambiguous reference destinations", () => {
    expect(() => noteReferenceMarkdown("外部", "https://example.com")).toThrow();
    expect(() => noteReferenceMarkdown("不明确", "/tasks")).toThrow();
    expect(() => noteReferenceMarkdown("额外参数", `/tasks?task=${id}&other=true`)).toThrow();
  });

  it("keeps punctuation readable when a copied work reference is reused", () => {
    const title = "[版本] *重点* & <对比>";
    expect(relatedWorkFromNote(noteReferenceMarkdown(title, `/tasks?task=${id}`))[0].title).toBe(title);
  });

  it("derives deduplicated related work with source labels and exact destinations", () => {
    const markdown = `[待办](/tasks?task=${id}) [重复](/tasks?task=${id}) [会议](/calendar?event=${id}) [资料](/files?file=${id}) [笔记](/notes/${id}) ![图片](/tasks?task=${id}) [外部](https://example.com)`;
    expect(relatedWorkFromNote(markdown)).toEqual([
      { id: `todo_task:${id}`, title: "待办", href: `/tasks?task=${id}`, source: "任务" },
      { id: `calendar_event:${id}`, title: "会议", href: `/calendar?event=${id}`, source: "日程" },
      { id: `document:${id}`, title: "资料", href: `/files?file=${id}`, source: "文件" },
    ]);
  });
});
