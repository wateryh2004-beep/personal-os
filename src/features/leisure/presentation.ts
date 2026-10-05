import type { LeisureRating, LeisureSummary, LeisureSource } from "./types";

export const leisureKindLabels = { film: "电影", series: "剧集", game: "游戏", book: "书", music: "音乐", outing: "出门走走", other: "体验" } as const;
export const leisureStatusLabels = { interested: "感兴趣", planned: "准备去", current: "进行中", completed: "已体验" } as const;
export type LeisureContext = { minutes: string; setting: string; company: string; budget: string };
export const emptyLeisureContext: LeisureContext = { minutes: "", setting: "", company: "", budget: "" };

function timestampAvailability(checkedAt: string | null, now: number): "verified" | "stale" | "unverified" {
  const checked = checkedAt ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(checked) || checked > now) return "unverified";
  return now - checked > 90 * 86400000 ? "stale" : "verified";
}

export function sourceAvailability(source: LeisureSource, now: number): "verified" | "stale" | "unverified" {
  return source.verification === "verified" ? timestampAvailability(source.checked_at, now) : source.verification;
}

/** A recently checked source cannot make an old or future-dated rating current. */
export function ratingAvailability(rating: LeisureRating, sources: LeisureSource[], now: number): "verified" | "stale" | "unverified" {
  const matchingSources = sources.filter((source) => source.kind === "rating" && source.url === rating.source_url);
  if (!matchingSources.length) return "unverified";
  const availability = [timestampAvailability(rating.checked_at, now), ...matchingSources.map((source) => sourceAvailability(source, now))];
  if (availability.includes("unverified")) return "unverified";
  return availability.includes("stale") ? "stale" : "verified";
}

export function formatLeisureDuration(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `约 ${hours} 小时${rest ? ` ${rest} 分钟` : ""}`;
}

export function matchesLeisureContext(experience: LeisureSummary, context: LeisureContext) {
  return (!context.minutes || experience.duration_minutes !== null && experience.duration_minutes <= Number(context.minutes))
    && (!context.setting || experience.setting === context.setting || experience.setting === "either")
    && (!context.company || experience.company === context.company || experience.company === "either")
    && (!context.budget || experience.budget === context.budget);
}

export function selectLeisureChoices(experiences: LeisureSummary[], context: LeisureContext) {
  const eligible = experiences.filter((item) => item.feedback?.reaction !== "not_for_me" && item.feedback?.status !== "completed" && matchesLeisureContext(item, context));
  const selected: LeisureSummary[] = [];
  const kinds = new Set<string>();
  for (const item of eligible) if (!kinds.has(item.kind) && selected.length < 4) { selected.push(item); kinds.add(item.kind); }
  for (const item of eligible) if (selected.length < 4 && !selected.includes(item)) selected.push(item);
  return selected;
}

export function hasLeisureMemory(item: LeisureSummary) {
  return Boolean(item.feedback?.personal_note.trim() || item.feedback?.linked_note_id || item.feedback?.reaction === "liked");
}
