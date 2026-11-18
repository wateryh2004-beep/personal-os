import { describe, expect, it } from "vitest";
import { history, redo, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import { renderPortableNoteHtml } from "@/features/notes/export/html";
import { noteCalloutFromSourceLine } from "@/features/notes/editor/note-color-syntax";
import { clearNoteInlineColor, setNoteCallout, setNoteInlineColor } from "@/features/notes/editor/note-color-commands";
import { markdownSlashCompletions, slashCommandLabels } from "@/features/notes/editor/markdown-slash-commands";

function editor(source: string, from = 0, to = from) {
  return EditorState.create({
    doc: source,
    selection: EditorSelection.range(from, to),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: false }), history()],
  });
}

function command(state: EditorState, run: StateCommand) {
  let next = state;
  const handled = run({ state, dispatch: transaction => { next = transaction.state; } });
  return { next, handled };
}

describe("Notes 3.0 P1.3 color formatting commands", () => {
  it("wraps one plain text selection in the exact portable ink syntax and supports undo/redo", () => {
    const source = "前文 重要结论 后文";
    const start = source.indexOf("重要结论");
    const { next, handled } = command(editor(source, start, start + 4), setNoteInlineColor("text", "important"));
    expect(handled).toBe(true);
    expect(next.doc.toString()).toBe("前文 {{ink:important|重要结论}} 后文");
    let current = next;
    expect(undo({ state: current, dispatch: t => { current = t.state; } })).toBe(true);
    expect(current.doc.toString()).toBe(source);
    expect(redo({ state: current, dispatch: t => { current = t.state; } })).toBe(true);
    expect(current.doc.toString()).toContain("{{ink:important|重要结论}}");
    expect(renderPortableNoteHtml("测试", current.doc.toString())).toContain("note-color-text");
  });

  it("changes the tone or kind of one entire token without nested formatting, then clears it", () => {
    const source = "文本 {{ink:info|测试文字}} 结尾";
    const from = source.indexOf("{{");
    const to = source.indexOf("}}") + 2;
    const recolor = command(editor(source, from, to), setNoteInlineColor("highlight", "idea"));
    expect(recolor.handled).toBe(true);
    expect(recolor.next.doc.toString()).toBe("文本 {{mark:idea|测试文字}} 结尾");
    const clear = command(recolor.next, clearNoteInlineColor);
    expect(clear.handled).toBe(true);
    expect(clear.next.doc.toString()).toBe("文本 测试文字 结尾");
    expect(renderPortableNoteHtml("测试", clear.next.doc.toString())).not.toContain("note-color-highlight");
  });

  it("recolors and clears a visible text-only selection without nesting source tokens", () => {
    const source = "前 {{ink:info|重要文字}} 后";
    const from = source.indexOf("重要文字");
    const to = from + "重要文字".length;
    const updated = command(editor(source, from, to), setNoteInlineColor("highlight", "warning"));
    expect(updated.handled).toBe(true);
    expect(updated.next.doc.toString()).toBe("前 {{mark:warning|重要文字}} 后");
    const visibleFrom = updated.next.doc.toString().indexOf("重要文字");
    const selected = editor(updated.next.doc.toString(), visibleFrom, visibleFrom + "重要文字".length);
    const cleared = command(selected, clearNoteInlineColor);
    expect(cleared.handled).toBe(true);
    expect(cleared.next.doc.toString()).toBe("前 重要文字 后");
  });

  it("never inserts noncanonical color wrappers for empty, multi-line, braces or code selections", () => {
    const scenarios: Array<[string, number, number]> = [
      ["普通文字", 0, 0],
      ["第一行\n第二行", 0, 7],
      ["带{花括号}文本", 0, 7],
      ["`不能着色`", 1, 5],
      ["~~~md\n代码\n~~~", 6, 8],
    ];
    for (const [source, from, to] of scenarios) {
      const initial = editor(source, from, to);
      const result = command(initial, setNoteInlineColor("text", "info"));
      expect(result.handled).toBe(false);
      expect(result.next.doc.toString()).toBe(source);
    }
  });

  it("wraps a paragraph or multiline selection in a GFM quote, leaving subsequent prose separate", () => {
    for (const source of ["结论\n下一行\n\n其他段落", "结论"]) {
      const from = 0;
      const to = source.includes("下一行") ? "结论\n下一行".length : 0;
      const result = command(editor(source, from, to), setNoteCallout("important"));
      expect(result.handled).toBe(true);
      const output = result.next.doc.toString();
      expect(output).toContain("> [!IMPORTANT]");
      expect(output).toContain("> 结论");
      expect(noteCalloutFromSourceLine(output.split("\n")[0])?.tone).toBe("important");
      const html = renderPortableNoteHtml("测试", output);
      expect(html).toContain("note-color-callout");
      if (source.includes("其他段落")) expect(html).toContain("</blockquote><p>其他段落</p>");
    }
  });

  it("inserts an empty callout with a writable first line and changes a block marker without nesting", () => {
    const result = command(editor("", 0), setNoteCallout("info"));
    expect(result.handled).toBe(true);
    expect(result.next.doc.toString()).toBe("> [!NOTE]\n> \n");
    expect(result.next.selection.main.head).toBe("> [!NOTE]\n> ".length);
    const source = "> [!NOTE]\n> 原有内容";
    const update = command(editor(source, 0), setNoteCallout("warning"));
    expect(update.handled).toBe(true);
    expect(update.next.doc.toString()).toBe("> [!WARNING]\n> 原有内容");
  });

  it("rejects code and existing ordinary quotes instead of nesting accidental callouts", () => {
    for (const source of ["~~~md\n代码\n~~~", "> 普通引用"]) {
      const initial = editor(source, source.indexOf("\n") + 1);
      const result = command(initial, setNoteCallout("idea"));
      expect(result.handled).toBe(false);
      expect(result.next.doc.toString()).toBe(source);
    }
  });

  it("exposes all five callout slash actions with cursor ready to type inside the quote", () => {
    expect(slashCommandLabels("色块")).toHaveLength(5);
    for (const name of ["信息", "提醒", "重点", "思考", "引用"]) {
      expect(slashCommandLabels("色块")).toContain("色块 · " + name);
    }
    const chosen = markdownSlashCompletions().find(x => x.label === "色块 · 思考");
    expect(chosen).toBeDefined();
    let state = editor("/色块");
    const fake = {
      dispatch(spec: Parameters<typeof state.update>[0]) { state = state.update(spec).state; },
      focus() {},
    } as unknown as import("@codemirror/view").EditorView;
    if (typeof chosen!.apply !== "function") throw Error("expected apply callback");
    chosen!.apply(fake, chosen!, 0, state.doc.length);
    expect(state.doc.toString()).toBe("> [!TIP]\n> \n");
    expect(state.selection.main.head).toBe("> [!TIP]\n> ".length);
  });
});
