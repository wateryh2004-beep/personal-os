import type { NoteLinkSuggestion } from "./types";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchScore(title: string, needle: string) {
  if (!needle) return 0;
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;

  // A compact subsequence score keeps partial Chinese and acronym-like queries
  // useful without presenting unrelated notes as matches.
  let cursor = 0;
  let gaps = 0;
  for (const character of needle) {
    const found = title.indexOf(character, cursor);
    if (found < 0) return null;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return 3 + gaps / Math.max(title.length, 1);
}

/** Deterministic title similarity ordering, with recency breaking ties. */
export function rankNoteLinkSuggestions(
  notes: readonly NoteLinkSuggestion[],
  query: string,
): NoteLinkSuggestion[] {
  const needle = normalized(query);
  return notes
    .flatMap((note) => {
      const score = matchScore(normalized(note.title), needle);
      return score === null ? [] : [{ note, score }];
    })
    .sort((left, right) => {
    const scoreDifference = left.score - right.score;
    if (scoreDifference) return scoreDifference;
    const updateDifference = timestamp(right.note.updatedAt) - timestamp(left.note.updatedAt);
    if (updateDifference) return updateDifference;
    return normalized(left.note.title).localeCompare(normalized(right.note.title), "zh-CN");
  })
    .map(({ note }) => note);
}
