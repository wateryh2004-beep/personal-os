import type { ContextCandidate } from "./types";

function authority(item: ContextCandidate) {
  if (item.entityType === "decision" || item.title.startsWith("Decision ·")) return 90;
  if (item.entityType === "profile_memory" || item.title.startsWith("Profile ·")) return 82;
  if (item.entityType === "working_memory" || item.title.startsWith("Working ·")) return 78;
  if (item.origins.includes("surface")) return 75;
  if (item.domain === "career" || item.domain === "profile") return 64;
  if (item.origins.includes("review")) return 50;
  if (item.origins.includes("time")) return 46;
  if (item.domain === "notes") return 28;
  return 38;
}

function stability(item: ContextCandidate) {
  if (item.entityType === "decision" || item.entityType === "profile_memory") return 36;
  if (item.entityType === "working_memory") return 28;
  if (item.domain === "career" || item.domain === "profile") return 24;
  if (item.origins.includes("review")) return 14;
  if (item.domain === "notes") return 6;
  return 10;
}

function recency(timestamp: string | null | undefined, now: Date) {
  if (!timestamp) return 0;
  const ageDays = Math.max(0, (now.getTime() - Date.parse(timestamp)) / 86_400_000);
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 1) return 24;
  if (ageDays <= 7) return 18;
  if (ageDays <= 30) return 12;
  if (ageDays <= 180) return 5;
  return 0;
}

export function rankContextCandidate(item: ContextCandidate, now = new Date()) {
  const authorityScore = authority(item);
  const stabilityScore = stability(item);
  const recencyScore = recency(item.timestamp, now);
  return {
    ...item,
    relevance: item.score,
    authority: authorityScore,
    stability: stabilityScore,
    recency: recencyScore,
    finalScore: item.score + authorityScore + stabilityScore + recencyScore,
  };
}

export function rankContextCandidates(items: ContextCandidate[], now = new Date()) {
  return items.map((item) => rankContextCandidate(item, now)).sort((a, b) => b.finalScore - a.finalScore);
}
