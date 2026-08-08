export type ParsedFeedItem = { externalId: string | null; url: string | null; title: string; author: string | null; publishedAt: string | null; updatedAt: string | null; excerpt: string; contentText: string };
export type ParsedFeed = { title: string; siteUrl: string | null; description: string; type: "rss" | "atom"; items: ParsedFeedItem[] };
export type FeedCandidate = { clusterId: string; itemId: string; feedId: string; title: string; excerpt: string; url: string | null; publishedAt: string | null; firstSeenAt: string; feedPriority: number; feedTitle: string };
export type BriefingInterest = { name: string; keywords: string[]; excludedKeywords: string[]; weight: number };
export type RankedCandidate = FeedCandidate & { score: number; matchedInterests: string[]; excluded: boolean; reason: string };
