import { foldEffect, foldGutter, foldedRanges, foldKeymap, foldService, unfoldEffect } from "@codemirror/language";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

/** Fold only the body of an ATX heading. The original Markdown is untouched. */
export function headingSectionRange(state: EditorState, headingFrom: number): { from: number; to: number } | null {
  if (headingFrom < 0 || headingFrom > state.doc.length) return null;
  const heading = state.doc.lineAt(headingFrom);
  if (heading.from !== headingFrom) return null;
  const match = /^ {0,3}(#{1,6})\s+/.exec(heading.text);
  if (!match) return null;
  let node = syntaxTree(state).resolveInner(heading.from + match[0].length - 1, -1);
  let recognized = false;
  while (node) {
    if (node.name === "ATXHeading" + match[1].length) { recognized = true; break; }
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "HTMLBlock") return null;
    node = node.parent;
  }
  if (!recognized) return null;
  let end = state.doc.length;
  for (let number = heading.number + 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const candidate = /^ {0,3}(#{1,6})\s+/.exec(line.text);
    if (!candidate || candidate[1].length > match[1].length) continue;
    let at = syntaxTree(state).resolveInner(line.from + candidate[0].length - 1, -1);
    while (at) {
      if (at.name === "ATXHeading" + candidate[1].length) {
        end = Math.max(heading.to, line.from - 1);
        break;
      }
      if (at.name === "FencedCode" || at.name === "CodeBlock" || at.name === "HTMLBlock") break;
      at = at.parent;
    }
    if (end !== state.doc.length) break;
  }
  return end > heading.to + 1 ? { from: heading.to, to: end } : null;
}

export function isMarkdownSectionFolded(view: EditorView, headingFrom: number): boolean {
  const range = headingSectionRange(view.state, headingFrom);
  if (!range) return false;
  let folded = false;
  foldedRanges(view.state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) folded = true;
  });
  return folded;
}

export function toggleMarkdownSection(view: EditorView, headingFrom: number): boolean {
  const range = headingSectionRange(view.state, headingFrom);
  if (!range) return false;
  const folded = isMarkdownSectionFolded(view, headingFrom);
  view.dispatch({ effects: folded ? unfoldEffect.of(range) : foldEffect.of(range) });
  return true;
}

/** The gutter handles ordinary mouse folds; the outline exposes the same
 * feature on narrow screens where the gutters are intentionally hidden. */
export const markdownSectionFolding: Extension = [
  foldService.of((state, from) => headingSectionRange(state, from)),
  foldGutter({ openText: "⌄", closedText: "›" }),
  keymap.of(foldKeymap),
];
