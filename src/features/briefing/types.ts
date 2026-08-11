export type ParsedFeedItem = { externalId: string | null; url: string | null; title: string; author: string | null; publishedAt: string | null; updatedAt: string | null; excerpt: string; contentText: string };
export type ParsedFeed = { title: string; siteUrl: string | null; description: string; type: "rss" | "atom"; items: ParsedFeedItem[] };
export type FeedCandidate = { clusterId: string; itemId: string; feedId: string; title: string; excerpt: string; url: string | null; publishedAt: string | null; firstSeenAt: string; feedPriority: number; feedTitle: string; category?: string | null; personalPriority?: string | null; sourceQuality?: string | null; contentHash?: string | null };
export type BriefingInterest = { name: string; keywords: string[]; excludedKeywords: string[]; weight: number };
export type RankedCandidate = FeedCandidate & { score: number; matchedInterests: string[]; excluded: boolean; reason: string };

export type BriefingFeedRefreshSummary = {
  activeFeedCount: number;
  feedsDue: number;
  feedsRefreshed: number;
  feedsFailed: number;
};

export type BriefingGenerationResult = {
  briefingId: string;
  selected: number;
  candidateCount: number;
  filteredCount: number;
  date: string;
  rankingMethod?: "ai_hybrid" | "deterministic_fallback" | "deterministic";
  aiCallCount?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type BriefingGenerationState = {
  status: "idle" | "success" | "warning" | "error";
  message: string;
  selected: number | null;
  candidateCount: number | null;
  feedsRefreshed: number | null;
  feedsFailed: number | null;
};
