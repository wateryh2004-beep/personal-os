import type { LeisureRating, LeisureSummary, LeisureSource } from "./types";

export const leisureKindLabels = {
  film: "电影",
  series: "剧集",
  game: "游戏",
  book: "书",
  music: "音乐",
  outing: "出门走走",
  other: "体验",
} as const;
export const leisureStatusLabels = {
  interested: "感兴趣",
  planned: "准备去",
  current: "进行中",
  completed: "已体验",
} as const;
export type LeisureContext = {
  minutes: string;
  setting: string;
  company: string;
  budget: string;
};
export const emptyLeisureContext: LeisureContext = {
  minutes: "",
  setting: "",
  company: "",
  budget: "",
};

function timestampAvailability(
  checkedAt: string | null,
  now: number,
): "verified" | "stale" | "unverified" {
  const checked = checkedAt ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(checked) || checked > now) return "unverified";
  return now - checked > 90 * 86400000 ? "stale" : "verified";
}

export function sourceAvailability(
  source: LeisureSource,
  now: number,
): "verified" | "stale" | "unverified" {
  return source.verification === "verified"
    ? timestampAvailability(source.checked_at, now)
    : source.verification;
}

/** A recently checked source cannot make an old or future-dated rating current. */
export function ratingAvailability(
  rating: LeisureRating,
  sources: LeisureSource[],
  now: number,
): "verified" | "stale" | "unverified" {
  const matchingSources = sources.filter(
    (source) => source.kind === "rating" && source.url === rating.source_url,
  );
  if (!matchingSources.length) return "unverified";
  const availability = [
    timestampAvailability(rating.checked_at, now),
    ...matchingSources.map((source) => sourceAvailability(source, now)),
  ];
  if (availability.includes("unverified")) return "unverified";
  return availability.includes("stale") ? "stale" : "verified";
}

export function formatLeisureDuration(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return `约 ${hours} 小时${rest ? ` ${rest} 分钟` : ""}`;
}

export type RemainingLeisureTime =
  | { state: "known"; minutes: number; continuing: boolean }
  | { state: "unknown"; reason: string };
/** Minutes are comparable only to minute progress. Episodes/pages never imply speed. */
export function remainingLeisureTime(
  item: LeisureSummary,
): RemainingLeisureTime {
  const total = item.duration_minutes;
  if (total === null || !Number.isFinite(total) || total <= 0)
    return { state: "unknown", reason: "总时长未记录" };
  const feedback = item.feedback;
  if (item.kind === "series" && feedback?.status === "current")
    return { state: "unknown", reason: "剧集时长与进度口径待核对" };
  if (feedback?.status !== "current")
    return { state: "known", minutes: total, continuing: false };
  if (feedback.progress_unit !== "minute" || feedback.progress_value == null)
    return { state: "unknown", reason: "进度尚不能换算为分钟" };
  if (feedback.progress_value < 0 || feedback.progress_value > total)
    return { state: "unknown", reason: "分钟进度与总时长不一致，请核对" };
  return {
    state: "known",
    minutes: total - feedback.progress_value,
    continuing: true,
  };
}
export function leisureTimeLabel(item: LeisureSummary) {
  const time = remainingLeisureTime(item);
  return time.state === "unknown"
    ? `时长未知 · ${time.reason}`
    : `${time.continuing ? "已知还需" : "总时长"} ${time.minutes} 分钟`;
}
export function matchesLeisureContext(
  experience: LeisureSummary,
  context: LeisureContext,
) {
  const time = remainingLeisureTime(experience);
  return (
    (!context.minutes ||
      (time.state === "known" && time.minutes <= Number(context.minutes))) &&
    (!context.setting ||
      experience.setting === context.setting ||
      experience.setting === "either") &&
    (!context.company ||
      experience.company === context.company ||
      experience.company === "either") &&
    (!context.budget || experience.budget === context.budget)
  );
}

export function selectLeisureChoices(
  experiences: LeisureSummary[],
  context: LeisureContext,
) {
  const eligible = experiences.filter(
    (item) =>
      item.feedback?.reaction !== "not_for_me" &&
      item.feedback?.status !== "completed" &&
      matchesLeisureContext(item, context),
  );
  const selected: LeisureSummary[] = [];
  const kinds = new Set<string>();
  for (const item of eligible)
    if (!kinds.has(item.kind) && selected.length < 4) {
      selected.push(item);
      kinds.add(item.kind);
    }
  for (const item of eligible)
    if (selected.length < 4 && !selected.includes(item)) selected.push(item);
  return selected;
}

export function hasLeisureMemory(item: LeisureSummary) {
  return Boolean(
    item.feedback?.personal_note.trim() ||
      item.feedback?.linked_note_id ||
      item.feedback?.reaction === "liked",
  );
}
