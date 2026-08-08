import type { BriefingInterest, FeedCandidate, RankedCandidate } from "./types";

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
