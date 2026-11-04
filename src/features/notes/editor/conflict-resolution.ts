/** Untrusted response from the authenticated, no-store note document route. */
export type RemoteNoteVersion = { title: string; body: string; revision: number };
type NoteText = Pick<RemoteNoteVersion, "title" | "body">;

export function parseRemoteNoteDocument(data: unknown): RemoteNoteVersion | null {
  if (!data || typeof data !== "object" || !("note" in data)) return null;
  const note = data.note;
  if (!note || typeof note !== "object" || !("title" in note) || !("body_markdown" in note) || !("revision" in note)) return null;
  if (typeof note.title !== "string" || typeof note.body_markdown !== "string" ||
      typeof note.revision !== "number" || !Number.isSafeInteger(note.revision) ||
      note.revision < 0) return null;
  return { title: note.title, body: note.body_markdown, revision: note.revision };
}

/** A new cloud revision can be adopted only for a user-reviewed local snapshot.
 * The subsequent server write still requires matching the cloud revision. */
export function canApplyNoteConflictMerge(input: {
  localNow: NoteText;
  localWhenOpened: NoteText;
  localRevision: number;
  knownRemoteRevision: number;
  selectedRemoteRevision: number;
  saveInProgress: boolean;
}): boolean {
  return !input.saveInProgress &&
    input.localNow.title === input.localWhenOpened.title &&
    input.localNow.body === input.localWhenOpened.body &&
    Number.isSafeInteger(input.selectedRemoteRevision) &&
    input.selectedRemoteRevision >= input.localRevision &&
    input.selectedRemoteRevision >= input.knownRemoteRevision;
}
