import { EditorView } from "@codemirror/view";

export type SourceAnchor = { line: number; offset: number };
export type EditorPosition = { anchor: number; head: number; viewport: SourceAnchor; scrollLeft: number; documentLength?: number; scrollEffect?: ReturnType<EditorView["scrollSnapshot"]> };
export type NoteContinuity = { reading: boolean; editor?: EditorPosition; reader?: SourceAnchor };

export function captureEditorPosition(view: EditorView): EditorPosition {
  const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(top);
  return { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head,
    viewport: { line: view.state.doc.lineAt(block.from).number, offset: top - block.top }, scrollLeft: view.scrollDOM.scrollLeft, documentLength: view.state.doc.length, scrollEffect: view.scrollSnapshot() };
}
export function restoreEditorPosition(view: EditorView, position: EditorPosition) {
  const doc = view.state.doc;
  const line = doc.line(Math.max(1, Math.min(doc.lines, position.viewport.line)));
  const snapshot = position.documentLength === doc.length ? position.scrollEffect : undefined;
  view.dispatch({ effects: snapshot ?? EditorView.scrollIntoView(line.from, { y: "start", yMargin: 0 }), selection: { anchor: Math.max(0, Math.min(doc.length, position.anchor)), head: Math.max(0, Math.min(doc.length, position.head)) } });
  if (snapshot) return;
  view.requestMeasure({ read: (current) => current.documentTop + current.lineBlockAt(line.from).top - current.scrollDOM.getBoundingClientRect().top, write: (offset, current) => {
    current.scrollDOM.scrollTop += offset + position.viewport.offset;
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
  if (anchor.line <= 1 && anchor.offset <= 0) { pane.scrollTop = 0; return; }
  let target: HTMLElement | undefined;
  for (const node of pane.querySelectorAll<HTMLElement>("[data-source-line]")) {
    if (Number(node.dataset.sourceLine) > anchor.line) break;
    target = node;
  }
  if (target) pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top + anchor.offset;
}
