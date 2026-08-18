import type { AiEvaluation, BriefingInterest, BriefingTopicBucket, FeedCandidate, RankedCandidate } from "./types";

function contains(text: string, keyword: string) { const source = text.toLocaleLowerCase().normalize("NFKC"); const needle = keyword.toLocaleLowerCase().normalize("NFKC").trim(); if (!needle) return false; if (/^[a-z0-9+#.-]+$/i.test(needle)) return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(source); return source.includes(needle); }
export function rankBriefingCandidates(candidates: FeedCandidate[], interests: BriefingInterest[], now = new Date()): RankedCandidate[] {
  return candidates.map((candidate) => {
    const text = `${candidate.title} ${candidate.excerpt}`; const matched: string[] = []; let interestScore = 0; let excluded = false;
    for (const interest of interests) { const positive = interest.keywords.some((keyword) => contains(text, keyword)); const negative = interest.excludedKeywords.some((keyword) => contains(text, keyword)); if (positive && !negative) { matched.push(interest.name); interestScore += Math.min(24, interest.weight / 4); } else if (positive && negative) excluded = true; }
    const effective = new Date(candidate.publishedAt ?? candidate.firstSeenAt).getTime(); const ageHours = Math.max(0, (now.getTime() - effective) / 36e5); const recency = ageHours <= 12 ? 30 : ageHours <= 24 ? 24 : ageHours <= 48 ? 16 : ageHours <= 72 ? 8 : 0;
    const source = candidate.feedPriority / 5; const quality = Math.min(10, (candidate.title.length >= 12 ? 4 : 0) + (candidate.excerpt.length >= 80 ? 6 : candidate.excerpt.length ? 2 : 0)); const score = excluded && !matched.length ? -100 : recency + source + interestScore + quality;
    return { ...candidate, score, matchedInterests: matched, excluded: excluded && !matched.length, reason: matched.length ? `与你关注的「${matched.slice(0,2).join("、")}」相关` : `来自 ${candidate.feedTitle} 的近期更新` };
  }).filter((item) => !item.excluded).sort((a,b) => b.score - a.score || new Date(b.publishedAt ?? b.firstSeenAt).getTime() - new Date(a.publishedAt ?? a.firstSeenAt).getTime());
}
export function diversifyCandidates(ranked: RankedCandidate[], limit = 8) { const selected: RankedCandidate[] = []; const feeds = new Map<string,number>(); for (const item of ranked) { if ((feeds.get(item.feedId) ?? 0) >= 2) continue; selected.push(item); feeds.set(item.feedId,(feeds.get(item.feedId) ?? 0)+1); if (selected.length >= limit) break; } return selected; }

/** 每日信息膳食的软配额目标。非硬约束——某类没有高质量内容时不硬凑。 */
export const BRIEFING_TOPIC_QUOTA: Record<BriefingTopicBucket, number> = {
  ai_tech: 3,
  business_startup: 2,
  finance_investing: 1,
  economy_society: 1,
  wildcard: 1,
};

export const BRIEFING_SELECTION = {
  minJudgmentValue: 40, // 判断价值门槛：低于此值不入选，宁可当天少于 8 条
  maxPerFeed: 2,
  exploreBonus: 5, // explore 信源进 wildcard 时的小幅加分（仅用于排序，不用于质量门槛）
} as const;

/** 判断价值 = 信息增量 + 学习价值 + 决策价值 + 新颖度。仅内部排序用，不展示。 */
export function judgmentValueOf(ai: AiEvaluation) {
  return Math.round(
    0.3 * ai.informationValue +
      0.3 * ai.learningValue +
      0.25 * ai.decisionValue +
      0.15 * ai.novelty,
  );
}

/**
 * 按 topic bucket 软配额做信息膳食分配。
 * - 判断价值不足（< minJudgmentValue）不硬凑，可少于 limit 条；
 * - 单个 feed 最多 maxPerFeed 条；
 * - explore 信源在排序时给小幅加分，使其有真实机会占据 wildcard slot。
 */
export function selectDiverseByQuota<T extends { feedId: string; personalPriority?: string | null; ai: AiEvaluation }>(
  items: T[],
  limit = 8,
): T[] {
  const selected: T[] = [];
  const feedCount = new Map<string, number>();
  const bucketCount = new Map<BriefingTopicBucket, number>();
  const scored = items
    .map((item) => ({
      item,
      value: judgmentValueOf(item.ai),
      rank: judgmentValueOf(item.ai) + (item.personalPriority === "explore" ? BRIEFING_SELECTION.exploreBonus : 0),
    }))
    .sort((a, b) => b.rank - a.rank);
  for (const { item, value } of scored) {
    const bucket = item.ai.topicBucket;
    if (value < BRIEFING_SELECTION.minJudgmentValue) continue;
    if ((feedCount.get(item.feedId) ?? 0) >= BRIEFING_SELECTION.maxPerFeed) continue;
    if ((bucketCount.get(bucket) ?? 0) >= BRIEFING_TOPIC_QUOTA[bucket]) continue;
    selected.push(item);
    feedCount.set(item.feedId, (feedCount.get(item.feedId) ?? 0) + 1);
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}
