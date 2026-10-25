"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { noteDocumentCache } from "@/features/notes/document-resource";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { captureEditorPosition, captureReadingAnchor, restoreEditorPosition, restoreReadingAnchor, type EditorPosition, type NoteContinuity, type SourceAnchor } from "@/features/notes/editor/continuity";

/** Keep intended positions until measured restoration finishes; interrupted mounts cannot replace them. */
export function useNoteContinuity(noteId: string) {
  const [initial] = useState(() => noteDocumentCache.position(noteId));
  const [reading, setReading] = useState(initial?.reading ?? false);
  const position = useRef<NoteContinuity>({ ...initial, reading: initial?.reading ?? false });
  const editor = useRef<EditorView | null>(null);
  const readingPaneRef = useRef<HTMLElement | null>(null);
  const readerStart = useRef<SourceAnchor | null>(null);
  const pending = useRef<EditorPosition | undefined>(initial?.editor);
  const running = useRef(false);
  const generation = useRef(0);
  const modeRestore = useRef(Boolean(initial?.reading));
  const scope = useRef(captureWorkspaceScope());
  const publish = useCallback(() => { if (scope.current()) noteDocumentCache.remember(noteId, position.current); }, [noteId]);
  const rememberPosition = useCallback((next: EditorPosition) => {
    if (position.current.reading || pending.current) return;
    position.current.editor = next; publish();
  }, [publish]);
  const rememberReading = useCallback(() => {
    if (readingPaneRef.current) position.current.reader = captureReadingAnchor(readingPaneRef.current);
    publish();
  }, [publish]);
  const onEditorReady = useCallback((view: EditorView) => {
    editor.current = view;
    if (!pending.current || running.current || position.current.reading || view.scrollDOM.clientHeight <= 0) return;
    running.current = true;
    const lease = ++generation.current;
    restoreEditorPosition(view, pending.current, () => {
      if (generation.current !== lease || position.current.reading || !scope.current()) return;
      pending.current = undefined; running.current = false;
      rememberPosition(captureEditorPosition(view));
    }, () => generation.current === lease && !position.current.reading && scope.current(), () => {
      if (generation.current === lease) running.current = false;
    });
  }, [rememberPosition]);
  const interruptEditorRestore = useCallback((view: EditorView) => {
    if (!pending.current) return;
    generation.current += 1; running.current = false; pending.current = undefined;
    rememberPosition(captureEditorPosition(view));
  }, [rememberPosition]);
  const switchReading = useCallback((next: boolean) => {
    if (next === position.current.reading) return;
    if (position.current.reading) rememberReading();
    else if (editor.current && !pending.current) rememberPosition(captureEditorPosition(editor.current));
    generation.current += 1; running.current = false;
    if (next && position.current.editor) position.current.reader = position.current.editor.viewport;
    position.current.reading = next; modeRestore.current = true;
    setReading(next); publish();
  }, [publish, rememberPosition, rememberReading]);
  useLayoutEffect(() => {
    if (!modeRestore.current) return;
    modeRestore.current = false;
    const current = position.current;
    if (reading && readingPaneRef.current) {
      restoreReadingAnchor(readingPaneRef.current, current.reader ?? current.editor?.viewport ?? { line: 1, offset: 0 });
      readerStart.current = captureReadingAnchor(readingPaneRef.current);
    } else if (!reading && current.editor) {
      const moved = readerStart.current && current.reader && (current.reader.line !== readerStart.current.line || Math.abs(current.reader.offset - readerStart.current.offset) > 2);
      const viewport = moved ? current.reader! : current.editor.viewport;
      const view = editor.current;
      let target = { ...current.editor, viewport, scrollEffect: moved ? undefined : current.editor.scrollEffect };
      if (moved && view) {
        const caret = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, viewport.line))).from;
        target = { ...target, anchor: caret, head: caret };
      }
      current.editor = target; pending.current = target; publish();
      if (view) onEditorReady(view);
    }
  }, [reading, onEditorReady, publish]);
  useLayoutEffect(() => () => {
    const view = editor.current;
    // During a rapid route reversal the original intended position remains authoritative.
    if (view?.dom.isConnected && !position.current.reading && !pending.current) rememberPosition(captureEditorPosition(view));
    generation.current += 1;
  }, [rememberPosition]);
  return { reading, switchReading, readingPaneRef, rememberReading, rememberPosition, onEditorReady, interruptEditorRestore };
}
