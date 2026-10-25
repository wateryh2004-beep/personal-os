import { describe, expect, it } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { history, undo, redo } from "@codemirror/commands";
import { documentCharacterCount } from "@/features/notes/editor/document-statistics";
import { parseEditorOutline, parseMarkdownOutline } from "@/features/notes/editor/markdown-outline";

describe("incremental note statistics and outline", () => {
  it("matches a full count through multi-range edits, CJK composition, deletion and undo/redo", () => {
    let state = EditorState.create({ doc: "# 标题\n\n正文 abc\t\n", extensions: [documentCharacterCount, history()] });
    const assertCount = () => expect(state.field(documentCharacterCount)).toBe(state.doc.toString().replace(/\s/g, "").length);
    const dispatch = (transaction: TransactionSpec) => { state = state.update(transaction).state; assertCount(); };
    dispatch({ changes: [{ from: 0, to: 2, insert: "## " }, { from: 9, to: 12, insert: "中文输入\n" }] });
    const target = { get state() { return state; }, dispatch: (tr: ReturnType<typeof state.update>) => { state = tr.state; assertCount(); } };
    undo(target); redo(target); dispatch({ changes: { from: 0, to: state.doc.length, insert: "" } }); assertCount();
  });
  it("keeps correct headings after fence, duplicate-heading and Setext edits in a long document", () => {
    let state = EditorState.create({ doc: ("## 重复\n\n正文\n\n".repeat(400)) + "```md\n# 隐藏\n```\n\n小节\n----\n", extensions: [markdown(), documentCharacterCount] });
    for (const insert of ["# 开头\n\n", "```\n", "```\n"]) {
      state = state.update({ changes: { from: 0, insert } }).state;
      expect(parseEditorOutline(state)).toEqual(parseMarkdownOutline(state.doc.toString()));
      expect(state.field(documentCharacterCount)).toBe(state.doc.toString().replace(/\s/g, "").length);
    }
  });
});
