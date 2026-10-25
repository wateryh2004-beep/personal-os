import { forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

export type SourceAnchor = { line: number; offset: number };
export type EditorPosition = { anchor: number; head: number; viewport: SourceAnchor; scrollLeft: number; documentLength?: number; scrollEffect?: ReturnType<EditorView["scrollSnapshot"]> };
export type NoteContinuity = { reading: boolean; editor?: EditorPosition; reader?: SourceAnchor };

export function captureEditorPosition(view: EditorView): EditorPosition {
  const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(top);
  const screenTop = view.scrollDOM.getBoundingClientRect().top;
  const visibleLine = [...view.scrollDOM.querySelectorAll<HTMLElement>(".cm-line[data-source-line]")].find((node) => node.getBoundingClientRect().bottom > screenTop + 1);
  const viewport = visibleLine
    ? { line: Number(visibleLine.dataset.sourceLine), offset: screenTop - visibleLine.getBoundingClientRect().top }
    : { line: view.state.doc.lineAt(block.from).number, offset: top - block.top };
  return { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head,
    viewport, scrollLeft: view.scrollDOM.scrollLeft, documentLength: view.state.doc.length, scrollEffect: view.scrollSnapshot() };
}
export function restoreEditorPosition(view: EditorView, position: EditorPosition, done: () => void = () => {}, isCurrent: () => boolean = () => true, deferred: () => void = () => {}) {
  let attempts = 0;
  let stableFrames = 0;
  const available = () => isCurrent() && view.dom.isConnected;
  const measure = () => {
    if (!available()) return;
    if (view.scrollDOM.clientHeight <= 0) { deferred(); return; }
    if (view.hasFocus) { done(); return; }
    view.requestMeasure({
      read: (current) => captureEditorPosition(current),
      write: (current) => {
        if (!available()) return;
        const doc = view.state.doc;
        const line = doc.line(Math.max(1, Math.min(doc.lines, position.viewport.line)));
        if (current.viewport.line === line.number && Math.abs(current.viewport.offset - position.viewport.offset) < 1 && syntaxTreeAvailable(view.state, line.to)) {
          if (++stableFrames >= 2) { done(); return; }
          requestAnimationFrame(measure); return;
        }
        stableFrames = 0;
        if (++attempts >= 12) { deferred(); return; }
        if (current.viewport.line === line.number) {
          view.scrollDOM.scrollTop += position.viewport.offset - current.viewport.offset;
          view.scrollDOM.scrollLeft = position.scrollLeft;
          requestAnimationFrame(measure);
        } else requestAnimationFrame(() => {
          if (!available()) return;
          view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 0 }) });
          measure();
        });
      },
    });
  };
  requestAnimationFrame(() => {
    if (!available()) return;
    if (view.scrollDOM.clientHeight <= 0) { deferred(); return; }
    // Taking focus interrupts restoration instead of fighting the user's input.
    if (view.hasFocus) { done(); return; }
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(doc.lines, position.viewport.line)));
    // Finish the target paragraph's syntax before accepting its measured height.
    forceParsing(view, line.to, 25);
    const snapshot = position.documentLength === doc.length ? position.scrollEffect : undefined;
    view.dispatch({ effects: snapshot ?? EditorView.scrollIntoView(line.from, { y: "start", yMargin: 0 }),
      selection: { anchor: Math.max(0, Math.min(doc.length, position.anchor)), head: Math.max(0, Math.min(doc.length, position.head)) } });
    measure();
  });
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
