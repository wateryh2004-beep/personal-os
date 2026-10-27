"use client";

import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { noteInsertionCharacterLimit } from "./note-insertion-limits";

export type NoteInsertionResult = { status: "applied" | "inactive" | "conflict" | "stale"; noteId?: string } | { status: "too-large"; actual: number; limit: number; noteId?: string };
export type NoteInsertionTarget = {
  noteId: string; label: string; role: "main" | "reference"; canEdit: boolean;
  insert: (markdown: string) => NoteInsertionResult | Promise<NoteInsertionResult>;
  flush?: () => Promise<boolean>;
};
type Registration = { token: symbol; current: () => boolean; target: NoteInsertionTarget };
const targets = new Map<symbol, Registration>();
const listeners = new Set<() => void>();
let generation = 0;
const emit = () => { generation += 1; listeners.forEach(listener => listener()); };
export const subscribeNoteInsertionTargets = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getNoteInsertionGeneration = () => generation;
registerWorkspaceScopeCleanup(() => { targets.clear(); emit(); });
export function registerNoteInsertionTarget(target: NoteInsertionTarget) {
  const token = Symbol(target.noteId);
  targets.set(token, { token, current: captureWorkspaceScope(), target });
  emit();
  return () => { if (targets.delete(token)) emit(); };
}
export function listNoteInsertionTargets() {
  return [...targets.values()].filter(entry => entry.current() && entry.target.canEdit).map(({ target }) => ({ noteId: target.noteId, label: target.label.slice(0, 160), role: target.role }));
}
export async function insertIntoAdjacentNote({ sourceNoteId, targetNoteId, markdown }: { sourceNoteId?: string; targetNoteId?: string; markdown: string }): Promise<NoteInsertionResult> {
  if (!markdown) return { status: "stale" };
  if (markdown.length > noteInsertionCharacterLimit) return { status: "too-large", actual: markdown.length, limit: noteInsertionCharacterLimit };
  const candidates = [...targets.values()].filter(entry => entry.current() && entry.target.canEdit && entry.target.noteId !== sourceNoteId && (!targetNoteId || entry.target.noteId === targetNoteId));
  const reference = candidates.filter(entry => entry.target.role === "reference");
  const eligible = targetNoteId ? candidates : reference.length ? reference : candidates;
  // Two live editors for one document are ambiguous too; never write both.
  if (eligible.length !== 1) return { status: "inactive" };
  const entry = eligible[0];
  const result = await entry.target.insert(markdown);
  return entry.current() && targets.has(entry.token) ? { ...result, noteId: entry.target.noteId } : { status: "stale" };
}
