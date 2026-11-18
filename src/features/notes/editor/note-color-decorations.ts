import { syntaxTree } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import {
  Decoration, EditorView, ViewPlugin, WidgetType,
  type DecorationSet, type ViewUpdate,
} from "@codemirror/view";
import { noteColorTones, type NoteColorTone } from "./note-color-palette";
import { noteCalloutFromSourceLine, noteInlineColorsInText } from "./note-color-syntax";

const label = new Map<NoteColorTone, string>(noteColorTones.map(tone => [tone.id, tone.label]));
const excludedAncestors = new Set(["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock", "Link", "Image", "Autolink"]);

class CalloutLabel extends WidgetType {
  constructor(readonly tone: NoteColorTone) { super(); }
  eq(other: CalloutLabel) { return this.tone === other.tone; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-note-callout-label";
    span.textContent = label.get(this.tone) ?? "提示";
    span.setAttribute("aria-label", span.textContent);
    return span;
  }
  ignoreEvent() { return false; }
}

function selectionTouches(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some(range =>
    range.empty ? range.from >= from && range.from <= to
      : range.from < to && range.to > from,
  );
}

function inNonProseSyntax(view: EditorView, at: number): boolean {
  let node = syntaxTree(view.state).resolveInner(at, -1);
  while (node) {
    if (excludedAncestors.has(node.name)) return true;
    node = node.parent!;
  }
  return false;
}

export function noteColorDecorations(view: EditorView): DecorationSet {
  const decorations: Array<import("@codemirror/state").Range<Decoration>> = [];
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);
  const visibleLines = new Set<number>();
  const styled = new Map<number, { tone: NoteColorTone; first: boolean; last: boolean }>();
  const callouts = new Map<number, { tone: NoteColorTone; markerStart: number; markerEnd: number }>();

  // Reuse the CodeMirror syntax tree so ordinary > quotes, code fences and
  // nested Markdown are never classified as colored callouts.
  for (const range of view.visibleRanges) {
    const firstLine = doc.lineAt(range.from).number;
    const lastLine = doc.lineAt(range.to).number;
    for (let n = firstLine; n <= lastLine; n++) visibleLines.add(doc.line(n).from);

    tree.iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (node.name !== "Blockquote") return;
        const first = doc.lineAt(node.from);
        const match = /^ {0,3}>\s?(\[!(?:NOTE|WARNING|IMPORTANT|TIP|QUOTE)\])(?=\s|$)/.exec(first.text);
        if (!match) return;
        const info = noteCalloutFromSourceLine(first.text);
        if (!info) return;
        const clippedFrom = doc.lineAt(Math.max(node.from, range.from)).number;
        const clippedTo = doc.lineAt(Math.min(node.to, range.to)).number;
        const lastBlockLine = doc.lineAt(node.to).number;
        for (let n = clippedFrom; n <= clippedTo; n++) {
          const sourceLine = doc.line(n);
          styled.set(sourceLine.from, {
            tone: info.tone, first: n === first.number, last: n === lastBlockLine,
          });
        }
        callouts.set(first.from, {
          tone: info.tone,
          markerStart: first.from + match[0].indexOf("[!"),
          markerEnd: first.from + match[0].indexOf("[!") + match[1].length,
        });
      },
    });
  }

  for (const from of visibleLines) {
    const line = doc.lineAt(from);
    const block = styled.get(from);
    if (block) {
      decorations.push(Decoration.line({
        class: "cm-note-colored-callout-line" +
          (block.first ? " cm-note-colored-callout-first" : "") +
          (block.last ? " cm-note-colored-callout-last" : ""),
        attributes: { "data-note-tone": block.tone },
      }).range(from));
    }
    const header = callouts.get(from);
    if (header && !selectionTouches(view, header.markerStart, header.markerEnd)) {
      decorations.push(Decoration.replace({
        widget: new CalloutLabel(header.tone),
      }).range(header.markerStart, header.markerEnd));
    }

    for (const match of noteInlineColorsInText(line.text)) {
      const from = line.from + match.from;
      const to = line.from + match.to;
      if (inNonProseSyntax(view, from)) continue;
      const className = match.role === "text" ? "note-color-text" : "note-color-highlight";
      if (!selectionTouches(view, from, to)) {
        decorations.push(Decoration.replace({}).range(from, line.from + match.contentFrom));
        decorations.push(Decoration.replace({}).range(line.from + match.contentTo, to));
      }
      decorations.push(Decoration.mark({
        class: className, attributes: { "data-note-tone": match.tone },
      }).range(line.from + match.contentFrom, line.from + match.contentTo));
    }
  }
  return Decoration.set(decorations, true);
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = noteColorDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = noteColorDecorations(update.view);
    }
  },
  { decorations: value => value.decorations },
);

export const markdownNoteColorDecorations: Extension = plugin;
