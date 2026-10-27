"use client";

import type { EditorView } from "@codemirror/view";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import type { NoteAiBaseline } from "./ai-action-runtime";

export type NoteAiLiveSnapshot = { noteId: string; revision: number; knownRemoteRevision: number; title: string; sourceMarkdown: string; role: "main" | "reference"; active?: boolean; editable: boolean; composing: boolean; conflict: boolean };
export type NoteAiChange = { mode: "replace" | "insert" | "title"; text: string };
type Target = { current: () => boolean; read: () => NoteAiLiveSnapshot; apply: (baseline: NoteAiBaseline, change: NoteAiChange) => boolean };
const targets = new Set<Target>();
let scopeToken = crypto.randomUUID();
export function registerNoteAiTarget(options: Omit<Target, "current">) {
  if (targets.size >= 16) return () => {};
  const value = { ...options, current: captureWorkspaceScope() }; targets.add(value);
  return () => { targets.delete(value); };
}
export function captureNoteAiBaseline(noteId: string, role: "main" | "reference", selection: NoteAiBaseline["selection"], readonlyDiscussion = false): NoteAiBaseline | null {
  const candidates = [...targets].filter(target => target.current() && target.read().noteId === noteId && target.read().role === role);
  if (candidates.length !== 1) return null;
  const live = candidates[0].read();
  if (live.active === false || (!live.editable && (!readonlyDiscussion || selection !== null)) || live.composing || live.conflict || live.knownRemoteRevision > live.revision) return null;
  if (selection && (!Number.isSafeInteger(selection.from) || !Number.isSafeInteger(selection.to) || selection.from < 0 || selection.to <= selection.from || selection.to > live.sourceMarkdown.length || live.sourceMarkdown.slice(selection.from, selection.to) !== selection.text)) return null;
  return { scopeToken, noteId, revision: live.revision, title: live.title, sourceMarkdown: live.sourceMarkdown, role, selection: selection ? { ...selection } : null };
}
export function applyNoteAiSuggestion(baseline: NoteAiBaseline, change: NoteAiChange): { status: "applied" | "conflict" | "inactive" | "ambiguous" } {
  if (baseline.scopeToken !== scopeToken) return { status: "inactive" };
  const candidates = [...targets].filter(target => target.current() && target.read().noteId === baseline.noteId && target.read().role === baseline.role);
  if (!candidates.length) return { status: "inactive" };
  if (candidates.length !== 1) return { status: "ambiguous" };
  const target = candidates[0], live = target.read();
  if (!live.editable || live.composing || live.conflict || live.knownRemoteRevision > live.revision || live.revision < baseline.revision) return { status: "conflict" };
  if (change.mode === "title" ? live.title !== baseline.title : live.sourceMarkdown !== baseline.sourceMarkdown) return { status: "conflict" };
  const selected = baseline.selection;
  if (change.mode !== "title" && selected && live.sourceMarkdown.slice(selected.from, selected.to) !== selected.text) return { status: "conflict" };
  return { status: target.apply(baseline, change) ? "applied" : "conflict" };
}
registerWorkspaceScopeCleanup(() => { targets.clear(); scopeToken = crypto.randomUUID(); });

/** The same transaction boundary used by the real NoteEditor and controlled CM verification. */
export function applyNoteAiEditorChange(view: EditorView, baseline: NoteAiBaseline, change: NoteAiChange): boolean {
  if (!view.dom.isConnected || view.composing || view.state.readOnly || change.mode === "title" || view.state.doc.toString() !== baseline.sourceMarkdown) return false;
  const selected = baseline.selection;
  if (selected && view.state.doc.sliceString(selected.from, selected.to) !== selected.text) return false;
  let from = selected ? selected.from : 0, insert = change.text;
  const to = selected ? selected.to : view.state.doc.length;
  if (change.mode === "insert") { from = to; insert = `${from ? "\n\n" : ""}${change.text}`; }
  if (view.state.doc.length - (to - from) + insert.length > 200_000) return false;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: "input.ai" });
  return true;
}
