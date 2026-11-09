export const notesNavigatorTitleEvent = "personal-os:notes-navigator-title";

export type NotesNavigatorTitleDetail = {
  noteId: string;
  title: string;
};

export function publishNotesNavigatorTitle(noteId: string, title: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotesNavigatorTitleDetail>(notesNavigatorTitleEvent, {
      detail: { noteId, title },
    }),
  );
}

export function patchNavigatorNoteTitle<T extends { id: string; title: string }>(
  notes: T[],
  noteId: string,
  title: string,
): T[] {
  const index = notes.findIndex((note) => note.id === noteId);
  if (index < 0 || notes[index].title === title) return notes;

  const next = [...notes];
  next[index] = { ...notes[index], title };
  return next;
}

/** The editor must never make a large navigator tree part of its keystroke
 * critical path. Queue a trailing update; flush when editing ends or unmounts.
 * Immediate programmatic replacements cancel stale queued titles.
 */
export const noteTitleNavigatorSyncDelayMs = 320;

export function createNavigatorTitlePublisher(
  noteId: string,
  notify: (noteId: string, title: string) => void = publishNotesNavigatorTitle,
) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    cancelTimer();
    if (pending === null) return;
    const title = pending;
    pending = null;
    notify(noteId, title);
  };
  return {
    queue(title: string) {
      pending = title;
      cancelTimer();
      timer = setTimeout(flush, noteTitleNavigatorSyncDelayMs);
    },
    flush,
    publishNow(title: string) {
      pending = null;
      cancelTimer();
      notify(noteId, title);
    },
    cancel() {
      pending = null;
      cancelTimer();
    },
  };
}
