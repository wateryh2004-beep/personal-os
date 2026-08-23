export const lastOpenedNoteSessionKey = "notes:last-opened";
export const lastOpenedNoteTtlMs = 20 * 60 * 1000;
export const lastNotesListSessionKey = "notes:last-list";
export const lastNotesListTtlMs = 2 * 60 * 60 * 1000;

const noteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Converts a same-tab session snapshot into an internal Notes route only. */
export function recentNoteHref(value: unknown) {
  if (!value || typeof value !== "object" || !("noteId" in value)) return "/notes";
  const noteId = (value as { noteId?: unknown }).noteId;
  return typeof noteId === "string" && noteIdPattern.test(noteId) ? `/notes/${noteId}` : "/notes";
}

/**
 * Restores the last Notes library context without ever allowing an external
 * or editor route to become the mobile back target.
 */
export function notesListHref(value: unknown) {
  if (!value || typeof value !== "object" || !("href" in value)) return "/notes";
  const href = (value as { href?: unknown }).href;
  if (typeof href !== "string" || !href.trim()) return "/notes";
  try {
    const base = new URL("https://personal-os.local/notes");
    const resolved = new URL(href, base);
    if (resolved.origin !== base.origin || resolved.pathname !== "/notes") return "/notes";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/notes";
  }
}
