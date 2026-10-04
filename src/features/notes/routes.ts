/** Existing editor and read-only views share one document identity and shell. */
export function noteDocumentId(pathname: string): string | null {
  return /^\/notes\/([0-9a-f-]{36})(?:\/read)?$/i.exec(pathname)?.[1] ?? null;
}

export function isNotesWorkspacePath(pathname: string): boolean {
  return pathname === "/notes" || noteDocumentId(pathname) !== null;
}
