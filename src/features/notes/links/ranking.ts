import type { NoteLinkSuggestion } from "./types";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Deterministic title-first ordering: exact, prefix, contains, then update time. */
export function rankNoteLinkSuggestions(
  notes: readonly NoteLinkSuggestion[],
  query: string,
): NoteLinkSuggestion[] {
  const needle = normalized(query);
  return [...notes].sort((left, right) => {
    const leftTitle = normalized(left.title);
    const rightTitle = normalized(right.title);
    const score = (title: string) =>
      !needle ? 3 : title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : 4;
    const scoreDifference = score(leftTitle) - score(rightTitle);
    if (scoreDifference) return scoreDifference;
    const updateDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt);
    if (updateDifference) return updateDifference;
    return leftTitle.localeCompare(rightTitle, "zh-CN");
  });
}
