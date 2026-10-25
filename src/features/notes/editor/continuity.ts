import type { EditorView } from "@codemirror/view";

export type SourceAnchor = { line: number; offset: number };
export type EditorPosition = { anchor: number; head: number; viewport: SourceAnchor; scrollLeft: number };
export type NoteContinuity = { reading: boolean; editor?: EditorPosition; reader?: SourceAnchor };

export function captureEditorPosition(view: EditorView): EditorPosition {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  return { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head,
    viewport: { line: view.state.doc.lineAt(block.from).number, offset: view.scrollDOM.scrollTop - block.top }, scrollLeft: view.scrollDOM.scrollLeft };
}
export function restoreEditorPosition(view: EditorView, position: EditorPosition) {
  const doc = view.state.doc;
  const line = doc.line(Math.max(1, Math.min(doc.lines, position.viewport.line)));
  view.dispatch({ selection: { anchor: Math.min(doc.length, position.anchor), head: Math.min(doc.length, position.head) } });
  view.requestMeasure({ read: (current) => current.lineBlockAt(line.from).top, write: (top, current) => {
    current.scrollDOM.scrollTop = top + position.viewport.offset;
    current.scrollDOM.scrollLeft = position.scrollLeft;
  } });
}
export function captureReadingAnchor(pane: HTMLElement): SourceAnchor {
  const top = pane.getBoundingClientRect().top;
  let anchor: SourceAnchor = { line: 1, offset: 0 };
  for (const node of pane.querySelectorAll<HTMLElement>("[data-source-line]")) {
    const bounds = node.getBoundingClientRect();
    if (bounds.top > top + 1) break;
    anchor = { line: Number(node.dataset.sourceLine), offset: top - bounds.top };
  }
  return anchor;
}
export function restoreReadingAnchor(pane: HTMLElement, anchor: SourceAnchor) {
  let target: HTMLElement | undefined;
  for (const node of pane.querySelectorAll<HTMLElement>("[data-source-line]")) {
    if (Number(node.dataset.sourceLine) > anchor.line) break;
    target = node;
  }
  if (target) pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top + anchor.offset;
}
