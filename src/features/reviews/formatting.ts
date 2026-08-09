import type { ReviewStructuredData } from "./types";
import type { ReviewEvidence, ReviewEvidenceItem } from "./evidence";

export const EMPTY_REVIEW_STRUCTURED_DATA: ReviewStructuredData = {
  wins: [],
  friction: [],
  openLoops: [],
  changes: [],
  lessons: [],
  nextFocus: [],
  freeReflection: "",
};

const sectionLabels: Array<[keyof ReviewStructuredData, string]> = [
  ["wins", "进展与收获"],
  ["friction", "阻力与摩擦"],
  ["openLoops", "仍未解决"],
  ["changes", "发生的变化"],
  ["lessons", "经验与认识"],
  ["nextFocus", "下一步重点"],
];

export function reviewStructuredDataToMarkdown(data: ReviewStructuredData) {
  const sections = sectionLabels.flatMap(([key, label]) => {
    const values = data[key];
    if (!Array.isArray(values) || !values.length) return [];
    return [`## ${label}`, values.map((value) => `- ${value}`).join("\n")];
  });
  if (data.freeReflection.trim()) {
    sections.push("## 自由复盘", data.freeReflection.trim());
  }
  return sections.join("\n\n").trim();
}

export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate.trim());
}

function reviewEvidenceItems(evidence: ReviewEvidence): ReviewEvidenceItem[] {
  return [
    ...evidence.calendar,
    ...evidence.tasksCompleted,
    ...evidence.tasksOpen,
    ...evidence.notes,
    ...evidence.inbox,
    ...evidence.career,
    ...evidence.projects,
    ...evidence.decisions,
  ];
}

/** User-visible Review drafts must cite titles, never database identifiers. */
export function humanizeReviewDraftSources(
  data: ReviewStructuredData,
  evidence: ReviewEvidence,
): ReviewStructuredData {
  const replacements = reviewEvidenceItems(evidence).flatMap((item) => [
    [`${item.type}:${item.id}`, item.title] as const,
    [`${item.type}：${item.id}`, item.title] as const,
    [item.id, item.title] as const,
  ]);
  const humanize = (text: string) =>
    replacements.reduce(
      (current, [reference, title]) => current.replaceAll(reference, title),
      text,
    );
  return {
    wins: data.wins.map(humanize),
    friction: data.friction.map(humanize),
    openLoops: data.openLoops.map(humanize),
    changes: data.changes.map(humanize),
    lessons: data.lessons.map(humanize),
    nextFocus: data.nextFocus.map(humanize),
    freeReflection: humanize(data.freeReflection),
  };
}

export function normalizeStoredStructuredData(value: unknown): ReviewStructuredData {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const list = (key: string) =>
    Array.isArray(source[key])
      ? source[key].filter((item): item is string => typeof item === "string")
      : [];
  return {
    wins: list("wins"),
    friction: list("friction"),
    openLoops: list("openLoops"),
    changes: list("changes"),
    lessons: list("lessons"),
    nextFocus: list("nextFocus"),
    freeReflection:
      typeof source.freeReflection === "string" ? source.freeReflection : "",
  };
}
