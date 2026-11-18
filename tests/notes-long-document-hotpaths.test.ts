import { describe, expect, it, vi } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { parseInternalNoteLinkOccurrences } from "@/features/notes/links/parser";
import {
  internalNoteLinkAtPosition,
  internalNoteLinksInVisibleRanges,
} from "@/features/notes/editor/visible-note-links";
import {
  extractNoteLinkQuery,
  extractNoteLinkQueryFromDoc,
} from "@/features/notes/editor/note-link-completion";
import {
  activeHeadingIndexAtOffset,
  parseEditorOutline,
} from "@/features/notes/editor/markdown-outline";
import { outlineFoldRanges } from "@/features/notes/editor/markdown-outline-fold-ranges";
import { headingSectionRange } from "@/features/notes/editor/markdown-section-fold";
import { parseMarkdownTables } from "@/features/notes/editor/markdown-table";
import { updateMarkdownTableCache } from "@/features/notes/editor/markdown-table-cache";

const targetId = "0590c8dd-5b8e-4c7c-aab1-7c24f24c0654";
const linkSource = `[测试笔记](/notes/${targetId})`;

function syntheticNote(targetLength: number, paragraphCount: number) {
  const blocks = Array.from({ length: paragraphCount }, (_, index) =>
    `## 章节 ${index + 1}\n` +
    `这一部分有用于测试的段落文字，内容不包含任何真实资料。${"模拟说明 text ".repeat(Math.max(3, Math.ceil(targetLength / paragraphCount / 11)))}\n`
  );
  const source = blocks.join("\n\n");
  const suffix = `\n\n| 地区 | 租金 |\n| --- | --- |\n| 模拟 | 10 |\n\n${linkSource}\n![示意图片](/api/files/synthetic-image/download?inline=1)\n\n@新\n`;
  return source.slice(0, Math.max(0, targetLength - suffix.length)) + suffix;
}

describe("Notes P0.4 long-document editor hot paths", () => {
  it.each([
    [5_000, 50],
    [50_000, 200],
    [190_000, 500],
  ])("limits link decoration and completion to local source for ~%i characters", (targetLength, paragraphs) => {
    const source = syntheticNote(targetLength, paragraphs);
    const doc = Text.of(source.split("\n"));
    const last = doc.line(doc.lines - 3);
    const linked = doc.line(doc.lines - 4);
    const begin = Math.max(0, linked.from - 16);
    const ranges = [{ from: begin, to: doc.length }];
    const flatten = vi.spyOn(doc, "toString").mockImplementation(() => {
      throw new Error("editor hot path flattened entire document");
    });
    try {
      const start = performance.now();
      const links = internalNoteLinksInVisibleRanges(doc, ranges);
      const duration = performance.now() - start;
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ noteId: targetId, from: linked.from, to: linked.to });
      expect(internalNoteLinkAtPosition(doc, linked.from + 3)?.noteId).toBe(targetId);
      expect(internalNoteLinkAtPosition(doc, last.from + 2)).toBeNull();

      const at = doc.line(doc.lines - 1);
      const token = extractNoteLinkQueryFromDoc(doc, at.to);
      expect(token).toMatchObject({ kind: "entity", from: at.from, to: at.to, query: "新" });
      expect(source.slice(token!.from, token!.to)).toBe("@新");
      expect(flatten).not.toHaveBeenCalled();
      // Synthetic fixture timings are diagnostic only, not user-browser INP.
      console.info(JSON.stringify({
        type: "notes_p0_4_synthetic_hotpath",
        characters: doc.length,
        lines: doc.lines,
        linkScanMs: Number(duration.toFixed(3)),
      }));
    } finally {
      flatten.mockRestore();
    }
  });

  it("preserves markdown offsets, image exclusion and multiple visible windows", () => {
    const source = [
      "开篇",
      `标题：${linkSource} 与其它文字`,
      `![不应当识别为笔记](/notes/${targetId})`,
      "正文说明",
      `其他链接 ${linkSource}`,
    ].join("\n");
    const doc = Text.of(source.split("\n"));
    const links = internalNoteLinksInVisibleRanges(doc, [
      { from: doc.line(2).from + 4, to: doc.line(2).to },
      { from: doc.line(5).from, to: doc.line(5).to },
      { from: doc.line(2).from, to: doc.line(2).to },
    ]);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(source.slice(link.from, link.to)).toBe(linkSource);
      expect(internalNoteLinkAtPosition(doc, link.from + 2)).toMatchObject(link);
    }
    expect(internalNoteLinkAtPosition(doc, doc.line(3).from + 5)).toBeNull();
    expect(parseInternalNoteLinkOccurrences(source)).toHaveLength(2);
  });

  it("keeps line-local mention/wiki completion behavior and absolute offsets", () => {
    const doc = Text.of([
      "开头的普通段落",
      "提醒 @Alice",
      "记录 [[未来计划",
      "邮箱 foo@bar.com",
      "结束",
    ]);
    for (const number of [2, 3, 4]) {
      const line = doc.line(number);
      const local = extractNoteLinkQuery(line.text, line.length);
      const indexed = extractNoteLinkQueryFromDoc(doc, line.to);
      expect(indexed).toEqual(local ? { ...local, from: local.from + line.from, to: local.to + line.from } : null);
    }
    expect(extractNoteLinkQueryFromDoc(doc, doc.line(2).to)?.kind).toBe("entity");
    expect(extractNoteLinkQueryFromDoc(doc, doc.line(3).to)?.kind).toBe("note");
    expect(extractNoteLinkQueryFromDoc(doc, doc.line(4).to)).toBeNull();
  });

  it("matches linear outline fold planning to existing section-fold semantics", () => {
    const body = [
      "# 概览", "第一部分", "## 子章节", "子章节内容",
      "~~~md", "# 代码中的伪标题", "~~~",
      "### 更深", "深层段落", "# 收尾", "收尾内容",
      "## 新的子节", "最后",
    ].join("\n");
    const state = EditorState.create({
      doc: body,
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: false })],
    });
    const headings = parseEditorOutline(state);
    const planned = outlineFoldRanges(state.doc, headings);
    for (const item of headings) {
      expect(planned.get(item.index) ?? null).toEqual(headingSectionRange(state, item.from));
    }
    expect(headings.every(item => !item.text.includes("伪标题"))).toBe(true);
    expect(activeHeadingIndexAtOffset(headings, -1)).toBe(-1);
    for (let index = 0; index < headings.length; index++) {
      expect(activeHeadingIndexAtOffset(headings, headings[index].from)).toBe(index);
    }
    expect(activeHeadingIndexAtOffset(headings, body.length)).toBe(headings.length - 1);
  });

  it("preserves all source text, cursor editing and undo/redo after a large paste", () => {
    const original = syntheticNote(190_000, 500);
    const inserted = "\\n| 一 | 二 |\\n| --- | --- |\\n| 甲 | 10 |\\n".replaceAll("\\n", "\n");
    let current = EditorState.create({ doc: original, extensions: [history()] });
    const insertionPoint = current.doc.line(20).to;
    current = current.update({
      changes: { from: insertionPoint, insert: inserted },
      selection: { anchor: insertionPoint + inserted.length },
      userEvent: "input.paste",
    }).state;
    expect(current.doc.sliceString(insertionPoint, insertionPoint + inserted.length)).toBe(inserted);
    expect(undo({ state: current, dispatch: transaction => { current = transaction.state; } })).toBe(true);
    expect(current.doc.toString()).toBe(original);
    expect(redo({ state: current, dispatch: transaction => { current = transaction.state; } })).toBe(true);
    expect(current.doc.sliceString(insertionPoint, insertionPoint + inserted.length)).toBe(inserted);
  });

  it("updates only nearby Markdown table source after ordinary long-note keystrokes", () => {
    const source = syntheticNote(190_000, 500);
    const note = EditorState.create({ doc: source });
    const previous = parseMarkdownTables(source);
    expect(previous).toHaveLength(1);
    const position = note.doc.line(10).to;
    const transaction = note.update({ changes: { from: position, insert: "一" }, userEvent: "input" });
    const updated = updateMarkdownTableCache(previous, transaction.changes, transaction.state.doc);
    expect(updated.fullRescan).toBe(false);
    expect(updated.scannedCharacters).toBeLessThan(2_000);
    expect(updated.tables).toHaveLength(1);
    expect(updated.tables[0].header).toEqual(["地区", "租金"]);
    expect(transaction.state.doc.length).toBe(note.doc.length + 1);
    expect(transaction.startState.doc.sliceString(0, 100)).not.toBe("");
  });
});
