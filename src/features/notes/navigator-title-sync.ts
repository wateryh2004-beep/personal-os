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
