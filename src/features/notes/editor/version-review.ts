import { diffLines } from "diff";

/** Bounded, exact Markdown line diff. Large documents remain available for
 * side-by-side inspection and whole-version restore without blocking the UI. */
export const NOTE_VERSION_DIFF_LIMIT = 100_000;
export type VersionReviewPart = {
  id: number;
  kind: "equal" | "changed";
  current: string;
  historical: string;
};

export function compareNoteVersions(current: string, historical: string): VersionReviewPart[] | null {
  if (current.length + historical.length > NOTE_VERSION_DIFF_LIMIT) return null;
  const parts: VersionReviewPart[] = [];
  let before = "", after = "";
  const flush = () => {
    if (!before && !after) return;
    parts.push({ id: parts.length, kind: "changed", current: before, historical: after });
    before = ""; after = "";
  };
  for (const piece of diffLines(current, historical)) {
    if (piece.added) after += piece.value;
    else if (piece.removed) before += piece.value;
    else {
      flush();
      parts.push({ id: parts.length, kind: "equal", current: piece.value, historical: piece.value });
    }
    if (parts.length > 400) return null;
  }
  flush();
  return parts.length > 400 ? null : parts;
}

/** Restores only user-selected changed segments; untouched Markdown is exact. */
export function applySelectedVersionChanges(parts: readonly VersionReviewPart[], selected: ReadonlySet<number>): string {
  return parts.map(part => part.kind === "changed" && selected.has(part.id) ? part.historical : part.current).join("");
}

export function previewVersionDiffStats(parts: readonly VersionReviewPart[]) {
  return { changed: parts.filter(part => part.kind === "changed").length,
    unchanged: parts.filter(part => part.kind === "equal").length };
}
