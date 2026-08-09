import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

function blockDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const lines = new Map<number, Set<string>>();
  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        let className: string | null = null;
        if (node.name === "Blockquote") className = "cm-note-quote";
        else if (node.name === "FencedCode" || node.name === "CodeBlock")
          className = "cm-note-code-block";
        else if (node.name === "ListItem") className = "cm-note-list-line";
        else if (/^ATXHeading[1-4]$/.test(node.name))
          className = `cm-note-${node.name.toLocaleLowerCase()}`;
        if (!className) return;
        const first = view.state.doc.lineAt(node.from).number;
        const last = view.state.doc.lineAt(node.to).number;
        for (let number = first; number <= last; number += 1) {
          const line = view.state.doc.line(number);
          const classes = lines.get(line.from) ?? new Set<string>();
          classes.add(className);
          lines.set(line.from, classes);
        }
      },
    });
  }
  for (const [position, classes] of [...lines.entries()].sort(
    (left, right) => left[0] - right[0],
  ))
    builder.add(
      position,
      position,
      Decoration.line({ class: [...classes].join(" ") }),
    );
  return builder.finish();
}

const markdownBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = blockDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged)
        this.decorations = blockDecorations(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.7em", fontWeight: "650", color: "#202321" },
  { tag: tags.heading2, fontSize: "1.35em", fontWeight: "620", color: "#252826" },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "610", color: "#292c2a" },
  { tag: tags.heading4, fontWeight: "610", color: "#303330" },
  { tag: tags.strong, fontWeight: "650", color: "#202321" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#343735" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "#777a75" },
  { tag: [tags.monospace, tags.processingInstruction], fontFamily: "var(--font-mono)", color: "#294f66" },
  { tag: [tags.link, tags.url], color: "#365f78", textDecoration: "underline", textDecorationColor: "#b7c9d2", textUnderlineOffset: "3px" },
  { tag: [tags.meta, tags.punctuation, tags.contentSeparator], color: "#9a9d97" },
  { tag: tags.quote, color: "#616661" },
]);

const editorTheme = EditorView.theme({
  "&": {
    minHeight: "100%",
    backgroundColor: "#fff",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "15.5px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    minHeight: "calc(100dvh - 300px)",
    overflow: "visible",
    fontFamily: "var(--font-sans)",
    lineHeight: "1.78",
  },
  ".cm-content": {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "820px",
    minHeight: "calc(100dvh - 300px)",
    margin: "0 auto",
    padding: "34px 42px 88px",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "1px 0" },
  ".cm-activeLine": { backgroundColor: "rgba(54, 95, 120, 0.035)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "1.5px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "#dfeaed !important",
  },
  ".cm-gutters": { display: "none" },
  ".cm-placeholder": { color: "var(--text-tertiary)", fontStyle: "normal" },
  ".cm-note-list-line": { paddingTop: "2px", paddingBottom: "2px" },
  ".cm-note-quote": {
    borderLeft: "2px solid #8aa5b4",
    backgroundColor: "#f7f9f9",
    color: "var(--text-secondary)",
    paddingLeft: "13px",
  },
  ".cm-note-code-block": {
    backgroundColor: "#f5f6f5",
    color: "#313632",
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
    lineHeight: "1.65",
    paddingLeft: "12px",
    paddingRight: "12px",
  },
  ".cm-note-atxheading1": { marginTop: "18px", marginBottom: "10px", lineHeight: "1.35" },
  ".cm-note-atxheading2": { marginTop: "16px", marginBottom: "7px", lineHeight: "1.42" },
  ".cm-note-atxheading3": { marginTop: "12px", marginBottom: "5px" },
  ".cm-note-atxheading4": { marginTop: "9px", marginBottom: "3px" },
  ".cm-panels": { backgroundColor: "#fff", color: "var(--text-primary)" },
  ".cm-search": { borderBottom: "1px solid var(--border-subtle)" },
  "@media (max-width: 640px)": {
    ".cm-content": { padding: "24px 20px 72px" },
  },
});

export const markdownEditorTheme: Extension = [
  editorTheme,
  syntaxHighlighting(markdownHighlight),
  markdownBlockPlugin,
  EditorView.lineWrapping,
];
