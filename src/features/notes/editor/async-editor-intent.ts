/** Background uploads/URL enrichment must never hijack a newer editing intent.
 * The caller captures its revision after installing any synchronous placeholder.
 * Losing focus, typing, or changing the selection invalidates cursor restoration.
 */
export function shouldRestoreAsyncEditorFocus(
  startedFocused: boolean,
  currentlyFocused: boolean,
  startedRevision: number,
  currentRevision: number,
): boolean {
  return startedFocused && currentlyFocused && startedRevision === currentRevision;
}
