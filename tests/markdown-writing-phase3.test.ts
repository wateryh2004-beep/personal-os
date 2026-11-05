import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import { extractMarkdownSlashQuery, markdownSlashCompletions, slashCommandLabels } from "@/features/notes/editor/markdown-slash-commands";
import { headingSectionRange } from "@/features/notes/editor/markdown-section-fold";
import { parseMarkdownImage, serializeMarkdownImage } from "@/features/notes/editor/markdown-image-preview";

function state(source: string) {
  return EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] });
}

describe("Phase 3 writing slash commands", () => {
  it("finds a slash only at the start of ordinary paragraphs", () => {
    expect(extractMarkdownSlashQuery(state("/表格"), 3)?.query).toBe("表格");
    expect(extractMarkdownSlashQuery(state("  /h2"), 5)?.query).toBe("h2");
    expect(extractMarkdownSlashQuery(state("普通文字 /h2"), 8)).toBeNull();
    const fenced = "~~~md\n/表格\n~~~";
    expect(extractMarkdownSlashQuery(state(fenced), fenced.indexOf("/表格") + 3)).toBeNull();
    expect(extractMarkdownSlashQuery(state("> /表格"), 6)).toBeNull();
  });

  it("provides structural commands without replacing user prose", () => {
    expect(slashCommandLabels("表格")).toContain("表格");
    expect(slashCommandLabels("h2")).toEqual(["标题 2"]);
    const options = markdownSlashCompletions();
    const heading = options.find(option => option.label === "标题 2");
    expect(heading).toBeDefined();
    const apply = heading?.apply;
    if (typeof apply !== "function") throw new Error("expected a completion apply function");
    let current = state("/h2");
    const view = {
      dispatch(spec: Parameters<typeof current.update>[0]) { current = current.update(spec).state; },
      focus() {},
    } as unknown as import("@codemirror/view").EditorView;
    apply(view, heading!, 0, 3);
    expect(current.doc.toString()).toBe("## ");
    expect(current.selection.main.head).toBe(3);
  });
});

describe("Phase 3 foldable document sections", () => {
  it("folds a heading body but keeps the next peer heading visible", () => {
    const source = "# 第一章\n正文\n## 子章节\n子段\n# 第二章\n继续";
    const input = state(source);
    const section = headingSectionRange(input, 0);
    expect(section).not.toBeNull();
    expect(section?.from).toBe(input.doc.line(1).to);
    expect(section?.to).toBe(input.doc.line(5).from - 1);
    expect(headingSectionRange(input, input.doc.line(3).from)?.to).toBe(input.doc.line(5).from - 1);
    expect(headingSectionRange(input, input.doc.line(2).from)).toBeNull();
    expect(input.doc.toString()).toBe(source);
  });

  it("does not fold a faux heading in fenced code", () => {
    const input = state("~~~md\n# 并非标题\n~~~\n# 正文标题\n正文");
    expect(headingSectionRange(input, input.doc.line(2).from)).toBeNull();
    expect(headingSectionRange(input, input.doc.line(4).from)).not.toBeNull();
  });
});

describe("Phase 3 portable image management", () => {
  it("preserves image captions and alt text without creating private HTML metadata", () => {
    const spec = { alt: "流程图", src: "/favicon.ico", title: '写作 "示例"' };
    const serialized = serializeMarkdownImage(spec);
    expect(serialized).toContain("![流程图](/favicon.ico");
    expect(parseMarkdownImage(serialized)).toEqual(spec);
    expect(parseMarkdownImage("![截图](/favicon.ico)")).toEqual({ alt: "截图", src: "/favicon.ico" });
  });

  it("rejects unsafe image schemes without changing original source", () => {
    expect(parseMarkdownImage("![恶意](javascript:alert(1))")).toBeNull();
    expect(parseMarkdownImage("![恶意](//evil.example/image.png)")).toBeNull();
    expect(() => serializeMarkdownImage({ alt: "X", src: "data:text/html,test" })).toThrow();
  });
});
