import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  scrollPastEnd,
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

export const markdownHeadingLineStyles = {
  h1: { lineHeight: "1.35" },
  h2: { lineHeight: "1.42" },
  h3: { lineHeight: "1.55" },
  h4: { lineHeight: "1.65" },
} as const;

const editorTheme = EditorView.theme({
  "&": {
    minHeight: "100%",
    height: "100%",
    backgroundColor: "#fff",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "15.5px",
  },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-scroller": {
    boxShadow: "inset 0 0 0 1px rgba(54, 95, 120, 0.22)",
  },
  ".cm-scroller": {
    minHeight: "0",
    height: "100%",
    overflow: "auto",
    overscrollBehavior: "contain",
    scrollPaddingBlock: "28%",
    scrollbarGutter: "stable",
    fontFamily: "var(--font-sans)",
    lineHeight: "1.78",
  },
  ".cm-content": {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "820px",
    minHeight: "100%",
    margin: "0 auto",
    padding: "34px 42px 64px",
    caretColor: "var(--accent)",
  },
  ".cm-line": { minHeight: "1.78em", padding: "0" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "rgba(54, 95, 120, 0.035)" },
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
  ".cm-note-atxheading1": markdownHeadingLineStyles.h1,
  ".cm-note-atxheading2": markdownHeadingLineStyles.h2,
  ".cm-note-atxheading3": markdownHeadingLineStyles.h3,
  ".cm-note-atxheading4": markdownHeadingLineStyles.h4,
  ".cm-note-image-upload": {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: "6px",
    borderRadius: "5px",
    backgroundColor: "var(--accent-soft)",
    padding: "1px 6px",
    color: "var(--accent)",
    fontSize: "12px",
    lineHeight: "1.6",
  },
  ".cm-note-image-upload-range": {
    borderRadius: "3px",
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-note-image-preview": {
    position: "relative",
    display: "inline-flex",
    maxWidth: "100%",
    margin: "8px 2px",
    verticalAlign: "middle",
    cursor: "pointer",
  },
  ".cm-note-image-preview img": {
    display: "block",
    maxWidth: "min(100%, 720px)",
    maxHeight: "520px",
    borderRadius: "8px",
    objectFit: "contain",
    backgroundColor: "var(--surface-sidebar)",
  },
  ".cm-note-image-preview:focus-within, .cm-note-image-preview:hover": {
    boxShadow: "0 0 0 2px rgba(54, 95, 120, 0.2)",
  },
  ".cm-note-image-preview-error": {
    minHeight: "72px",
    minWidth: "240px",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--surface-sidebar)",
  },
  ".cm-note-image-preview-error img": { display: "none" },
  ".cm-note-image-preview-error::after": {
    content: "attr(data-error)",
    padding: "12px",
    color: "var(--text-secondary)",
    fontSize: "13px",
  },
  ".cm-note-internal-link": { cursor: "pointer" },
  ".cm-note-internal-link-label": {
    borderRadius: "4px",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent)",
    fontWeight: "560",
    textDecoration: "none",
  },
  ".cm-note-internal-link-url": {
    color: "transparent",
    fontSize: "0",
    textDecoration: "none",
  },
  ".cm-focused .cm-note-internal-link-label:hover": {
    backgroundColor: "#dbe9ee",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  ".cm-tooltip.cm-note-link-completion": {
    zIndex: "20",
    overflow: "hidden",
    minWidth: "min(320px, calc(100vw - 24px))",
    maxWidth: "min(420px, calc(100vw - 24px))",
    border: "1px solid var(--border-subtle)",
    borderRadius: "8px",
    backgroundColor: "var(--surface-canvas)",
    boxShadow: "0 8px 24px rgba(30, 35, 32, 0.12)",
  },
  ".cm-note-link-completion > ul": { maxHeight: "min(320px, 42vh)", fontFamily: "var(--font-sans)" },
  ".cm-note-link-completion > ul > li": { padding: "7px 10px" },
  ".cm-note-link-completion .cm-completionLabel": { fontWeight: "560" },
  ".cm-note-link-completion .cm-completionDetail": { color: "var(--text-tertiary)", fontStyle: "normal" },
  ".cm-tooltip-hover": {
    zIndex: "21",
    maxWidth: "min(340px, calc(100vw - 24px))",
    border: "1px solid var(--border-subtle)",
    borderRadius: "8px",
    backgroundColor: "var(--surface-canvas)",
    boxShadow: "0 10px 28px rgba(30, 35, 32, 0.14)",
  },
  ".cm-note-link-preview": {
    display: "grid",
    gap: "6px",
    width: "300px",
    padding: "11px 12px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    lineHeight: "1.55",
  },
  ".cm-note-link-preview strong": { color: "var(--text-primary)", fontSize: "13px" },
  ".cm-note-link-preview span": { color: "var(--text-tertiary)" },
  ".cm-note-link-preview p": {
    display: "-webkit-box",
    overflow: "hidden",
    margin: "2px 0 0",
    color: "var(--text-secondary)",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: "4",
  },
  ".cm-note-link-preview-broken": { color: "var(--danger)" },
  ".cm-panels": { backgroundColor: "#fff", color: "var(--text-primary)" },
  ".cm-search": { borderBottom: "1px solid var(--border-subtle)" },
  "@media (max-width: 640px)": {
    "&": { fontSize: "16px" },
    ".cm-scroller": { scrollbarGutter: "auto", scrollPaddingBlock: "24%" },
    ".cm-content": {
      padding: "22px 16px max(calc(env(safe-area-inset-bottom) + 24px), 48px)",
    },
    ".cm-line": { minHeight: "1.86em" },
  },
});

export const markdownEditorTheme: Extension = [
  editorTheme,
  syntaxHighlighting(markdownHighlight),
  markdownBlockPlugin,
  EditorView.lineWrapping,
  scrollPastEnd(),
];
