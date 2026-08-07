export const lastOpenedNoteSessionKey = "notes:last-opened";
export const lastOpenedNoteTtlMs = 12 * 60 * 60 * 1000;

const noteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Converts a same-tab session snapshot into an internal Notes route only. */
export function recentNoteHref(value: unknown) {
  if (!value || typeof value !== "object" || !("noteId" in value)) return "/notes";
  const noteId = (value as { noteId?: unknown }).noteId;
  return typeof noteId === "string" && noteIdPattern.test(noteId) ? `/notes/${noteId}` : "/notes";
}
