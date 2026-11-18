// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { describe, expect, it, vi } from "vitest";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { renderPortableNoteHtml } from "@/features/notes/export/html";
import { noteColorDecorations } from "@/features/notes/editor/note-color-decorations";
import { noteCalloutFromHeader, noteCalloutFromSourceLine, noteInlineColorsInText } from "@/features/notes/editor/note-color-syntax";
import { noteColorSanitizeSchema } from "@/features/notes/editor/note-color-sanitize";
import { noteColorTones } from "@/features/notes/editor/note-color-palette";
import { notePortableColorCss } from "@/features/notes/editor/note-color-print";
import { readFileSync } from "node:fs";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));

const markdownBody = [
  "> [!NOTE]",
  "> **资料**与 [站内笔记](/notes/0590c8dd-5b8e-4c7c-aab1-7c24f24c0654)",
  ">",
  "> - 第一段",
  "> - 第二段",
  "",
  "> [!WARNING] 注意风险",
  "> 这是第二段。",
  "",
  "文字 {{ink:info|信息来源}} 与 {{mark:important|需要关注的点}}，以及正常 **加粗**。",
].join("\n");

function renderNote(body: string, colors = true) {
  return renderToStaticMarkup(createElement(EntityMarkdown, { body, noteColors: colors, className: "note-reading-prose" }));
}

describe("Notes P1.2 canonical syntax and safe rendering", () => {
  it("accepts exactly five callout tags and restricted color spans", () => {
    expect(noteCalloutFromHeader("[!NOTE]")?.tone).toBe("info");
    expect(noteCalloutFromHeader("[!TIP] ")?.tone).toBe("idea");
    expect(noteCalloutFromHeader("[!WARNING]")?.tone).toBe("warning");
    expect(noteCalloutFromHeader("[!IMPORTANT]")?.tone).toBe("important");
    expect(noteCalloutFromHeader("[!QUOTE]")?.tone).toBe("quote");
    expect(noteCalloutFromSourceLine("> [!NOTE]")?.tone).toBe("info");
    expect(noteCalloutFromSourceLine("普通文字 [!NOTE]")).toBeNull();
    expect(noteCalloutFromHeader("[!HACK]")).toBeNull();
    const spans = noteInlineColorsInText("A {{ink:idea|想法}} B {{mark:warning|提醒}}");
    expect(spans.map(({ role,tone,text }) => ({ role,tone,text }))).toEqual([
      { role: "text", tone: "idea", text: "想法" },
      { role: "highlight", tone: "warning", text: "提醒" },
    ]);
    expect(noteInlineColorsInText("{{mark:evil|错误}}")).toEqual([]);
    expect(noteInlineColorsInText("{{ink:info|跨\n行}}")).toEqual([]);
  });

  it("renders the same nested Markdown in reading and portable HTML/print", () => {
    const reading = renderNote(markdownBody);
    const exported = renderPortableNoteHtml("色块验证", markdownBody, true);
    for (const html of [reading, exported]) {
      expect(html).toContain('class="note-color-callout"');
      expect(html).toContain('data-note-tone="info"');
      expect(html).toContain('data-note-tone="warning"');
      expect(html).toContain('class="note-color-text"');
      expect(html).toContain('class="note-color-highlight"');
      expect(html).toContain("信息来源");
      expect(html).toContain("需要关注的点");
      expect(html).toContain("<strong>资料</strong>");
      expect(html).toContain("<li");
      expect(html).toContain("<a");
      expect(html).not.toContain("[!NOTE]");
      expect(html).not.toContain("{{mark:");
    }
    expect(exported).toContain("保存为 PDF");
    expect(exported).toContain("background:var(--note-tone-surface)");
  });

  it("does not apply Notes-only formatting to generic EntityMarkdown", () => {
    const generic = renderNote(markdownBody, false);
    expect(generic).not.toContain("note-color-callout");
    expect(generic).not.toContain('data-note-tone="info"');
    expect(generic).toContain("{{ink:info|信息来源}}");
  });

  it("keeps source Markdown unchanged and displays unknown or incomplete syntax visibly", () => {
    const text = "普通块 > 测试\n\n> [!UNSUPPORTED] 没有映射\n\n{{ink:bad|不能着色}}\n\n{{ink:info|半个";
    const before = text;
    const out = renderNote(text);
    expect(text).toBe(before);
    expect(out).not.toContain("note-color-callout");
    expect(out).toContain("[!UNSUPPORTED]");
    expect(out).toContain("{{ink:bad|不能着色}}");
    expect(out).toContain("{{ink:info|半个");
  });

  it("does not parse formatting inside code or enable untrusted raw HTML", () => {
    const source = [
      "`{{mark:important|代码中保持原样}}`",
      "",
      "~~~md",
      "> [!NOTE]",
      "{{ink:info|原样}}",
      "~~~",
      "",
      '<script>alert("xss")</script>',
      '<span style="color:red" onclick="alert(1)">危险</span>',
      "{{mark:important|<img onerror=alert(1)>}}",
    ].join("\n");
    const html = renderPortableNoteHtml("<img onerror=alert(1)>", source);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("<img onerror=");
    expect(html).not.toContain('style="color:red"');
    expect(html).toContain("&lt;img");
    expect(html).toContain("{{ink:info|原样}}");
    expect(html).toContain("{{mark:important|代码中保持原样}}");
  });

  it("limits exported classes and colors to the sanitizer whitelist", () => {
    const attr = noteColorSanitizeSchema.attributes!;
    expect(attr.blockquote).toContainEqual(["className", "note-color-callout"]);
    expect(attr.span).toContainEqual(["className", "note-color-text", "note-color-highlight"]);
    expect(JSON.stringify(attr)).not.toContain("style");
    expect(JSON.stringify(attr)).not.toContain("onclick");
    const css = readFileSync("src/app/notes-colors.css", "utf8");
    for (const tone of noteColorTones) {
      const line = notePortableColorCss.split("\n").find(row => row.startsWith('[data-note-tone="' + tone.id + '"]'));
      expect(line).toBeDefined();
      for (const key of ["surface","ink","edge","mark"] as const) {
        const color = /#(?:[a-f\d]{6})/ig;
        const values = line!.match(color)!;
        expect(values).toHaveLength(4);
        expect(css).toContain(`--note-color-${tone.id}-${key}: ${values[["surface","ink","edge","mark"].indexOf(key)]}`);
      }
    }
  });

  it("decorates color syntax in the CodeMirror visual view without changing the document or undo state", () => {
    const source = "> [!NOTE]\n> 这里是 **示例**\n\n{{ink:info|蓝色文字}} + {{mark:idea|高亮}}";
    const state = EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
    });
    const fakeView = { state, visibleRanges: [{ from: 0, to: source.length }] } as unknown as import("@codemirror/view").EditorView;
    const deco = noteColorDecorations(fakeView);
    const classes: string[] = [];
    deco.between(0, source.length, (_from,_to,value) => {
      if (value.spec.class) classes.push(value.spec.class);
    });
    expect(classes.some(value => value.includes("note-color-text"))).toBe(true);
    expect(classes.some(value => value.includes("note-color-highlight"))).toBe(true);
    expect(classes.some(value => value.includes("cm-note-colored-callout-line"))).toBe(true);
    expect(state.doc.toString()).toBe(source);
  });
});
