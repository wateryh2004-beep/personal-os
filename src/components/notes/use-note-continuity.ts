"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { noteDocumentCache } from "@/features/notes/document-resource";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { captureEditorPosition, captureReadingAnchor, restoreEditorPosition, restoreReadingAnchor, type EditorPosition, type NoteContinuity, type SourceAnchor } from "@/features/notes/editor/continuity";
export type ContinuityRestoreCallbacks = { onRestored?: () => void; onCancelled?: () => void };

/** Keep intended positions until measured restoration finishes; interrupted mounts cannot replace them. */
export function useNoteContinuity(noteId: string) {
  const [initial] = useState(() => noteDocumentCache.position(noteId));
  const [restoreRevision, setRestoreRevision] = useState(0);
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
  const acknowledgement = useRef<(ContinuityRestoreCallbacks & { token: symbol }) | null>(null);
  const finishRestore = useCallback((expected: symbol | undefined, applied: boolean) => {
    const current = acknowledgement.current;
    if (!current || current.token !== expected) return;
    acknowledgement.current = null;
    if (applied && scope.current()) current.onRestored?.(); else current.onCancelled?.();
  }, []);
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
    if (running.current || position.current.reading || view.scrollDOM.clientHeight <= 0) return;
    const request = acknowledgement.current?.token;
    if (!pending.current) { finishRestore(request, true); return; }
    if (view.hasFocus && request) { finishRestore(request, false); return; }
    running.current = true;
    const lease = ++generation.current;
    restoreEditorPosition(view, pending.current, () => {
      if (generation.current !== lease || position.current.reading || !scope.current()) return;
      pending.current = undefined; running.current = false;
      rememberPosition(captureEditorPosition(view));
      finishRestore(request, !view.hasFocus);
    }, () => generation.current === lease && !position.current.reading && scope.current(), () => {
      if (generation.current === lease) { running.current = false; finishRestore(request, false); }
    });
  }, [rememberPosition, finishRestore]);
  const interruptEditorRestore = useCallback((view: EditorView) => {
    finishRestore(acknowledgement.current?.token, false);
    if (!pending.current) return;
    generation.current += 1; running.current = false; pending.current = undefined;
    rememberPosition(captureEditorPosition(view));
  }, [rememberPosition, finishRestore]);
  const switchReading = useCallback((next: boolean) => {
    finishRestore(acknowledgement.current?.token, false);
    if (next === position.current.reading) return;
    if (position.current.reading) rememberReading();
    else if (editor.current && !pending.current) rememberPosition(captureEditorPosition(editor.current));
    generation.current += 1; running.current = false;
    if (next && position.current.editor) position.current.reader = position.current.editor.viewport;
    position.current.reading = next; modeRestore.current = true;
    setReading(next); publish();
  }, [publish, rememberPosition, rememberReading, finishRestore]);
  const restoreContinuity = useCallback((value: NoteContinuity, callbacks?: ContinuityRestoreCallbacks) => {
    finishRestore(acknowledgement.current?.token, false);
    if (!scope.current()) { callbacks?.onCancelled?.(); return; }
    acknowledgement.current = callbacks ? { ...callbacks, token: Symbol("continuity-restore") } : null;
    generation.current += 1; running.current = false;
    position.current = value; pending.current = value.editor;
    readerStart.current = null; modeRestore.current = true;
    setReading(value.reading); setRestoreRevision((revision) => revision + 1); publish();
  }, [publish, finishRestore]);
  useLayoutEffect(() => {
    if (!modeRestore.current) return;
    modeRestore.current = false;
    if (!scope.current()) { finishRestore(acknowledgement.current?.token, false); return; }
    const current = position.current;
    if (reading && readingPaneRef.current) {
      restoreReadingAnchor(readingPaneRef.current, current.reader ?? current.editor?.viewport ?? { line: 1, offset: 0 });
      readerStart.current = captureReadingAnchor(readingPaneRef.current);
      finishRestore(acknowledgement.current?.token, true);
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
    } else if (!reading && editor.current) {
      finishRestore(acknowledgement.current?.token, true);
    }
  }, [reading, restoreRevision, onEditorReady, publish, finishRestore]);
  useLayoutEffect(() => () => {
    const view = editor.current;
    // During a rapid route reversal the original intended position remains authoritative.
    if (view?.dom.isConnected && !position.current.reading && !pending.current) rememberPosition(captureEditorPosition(view));
    generation.current += 1;
    finishRestore(acknowledgement.current?.token, false);
  }, [rememberPosition, finishRestore]);
  return { reading, switchReading, restoreContinuity, readingPaneRef, rememberReading, rememberPosition, onEditorReady, interruptEditorRestore };
}
