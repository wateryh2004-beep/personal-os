import { contentHash } from "@/features/notes/utils";

export type NoteRevisionSnapshot = {
  revision: number;
  bodyMarkdown: string;
  contentHash?: string | null;
};

export function noteRevisionMatches(
  note: NoteRevisionSnapshot | null | undefined,
  expected: { revision: number; contentHash: string },
) {
  if (!note || note.revision !== expected.revision) return false;
  return (note.contentHash || contentHash(note.bodyMarkdown)) === expected.contentHash;
}
