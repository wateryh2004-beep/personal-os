"use client";

import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";

import type { FileRecord } from "./queries";

export const maxFilePublications = 200;
let overflow = false;
export const getFilePublicationOverflow = () => overflow;
export const getFilePublicationOverflowServerSnapshot = () => false;
export type FilePublication = { documentId: string; version: number; confirmed?: string | null };
type Listener = { current: () => boolean; notify: () => void };
// Only changed IDs and a finite list-metadata signature survive route unmount,
// never component setters, file bodies or provider credentials. Each mount
// rereads those rows from the authorized API; agreeing server rows retire hints.
const publications = new Map<string, FilePublication>();
const listeners = new Set<Listener>();
let version = 0;
registerWorkspaceScopeCleanup(() => { publications.clear(); overflow = false; for (const listener of listeners) listener.notify(); listeners.clear(); });
export function publishFileRecordChange(documentId: string, current: () => boolean) {
  if (!current()) return;
  const value = { documentId, version: ++version };
  if (publications.has(documentId) || publications.size < maxFilePublications) publications.set(documentId, value);
  else overflow = true; // Never silently evict an unconfirmed ID; expose bounded manual recovery.
  for (const listener of listeners) if (listener.current()) listener.notify();
  window.dispatchEvent(new CustomEvent("personal-os:file-upload-published", { detail: { documentId } }));
}
function signature(row: FileRecord) {
  return JSON.stringify([row.id, row.title, row.original_filename, row.mime_type, row.file_size, row.folder_id, row.uploaded_at, row.created_at, row.archived_at, row.ai_visibility, row.text_extraction_status, row.extracted_character_count, row.mutation_revision]);
}
export function confirmFilePublication(value: FilePublication, row: FileRecord | null) {
  if (filePublicationIsCurrent(value)) value.confirmed = row ? signature(row) : null;
}
/** Once an ordinary server navigation agrees, this technical hint is redundant. */
export function acknowledgeFilePublicationSources(rows: FileRecord[]) {
  const source = new Map(rows.map(row => [row.id, signature(row)]));
  for (const [id, publication] of publications) {
    if ((publication.confirmed !== undefined && publication.confirmed === source.get(id)) || (publication.confirmed === null && !source.has(id))) publications.delete(id);
  }
}
export function getFilePublications() { return [...publications.values()]; }
export function filePublicationIsCurrent(value: FilePublication) { return publications.get(value.documentId) === value; }
export function subscribeFilePublications(notify: () => void) {
  const listener = { current: captureWorkspaceScope(), notify };
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
