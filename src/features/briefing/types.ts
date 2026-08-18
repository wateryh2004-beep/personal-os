export type ParsedFeedItem = { externalId: string | null; url: string | null; title: string; author: string | null; publishedAt: string | null; updatedAt: string | null; excerpt: string; contentText: string };
export type ParsedFeed = { title: string; siteUrl: string | null; description: string; type: "rss" | "atom"; items: ParsedFeedItem[] };

/** 语义主题桶：决定每日信息膳食分配的五个类别。 */
export type BriefingTopicBucket =
  | "ai_tech"
  | "business_startup"
  | "finance_investing"
  | "economy_society"
  | "wildcard";

/** AI 对候选的判断价值评估。仅系统内部排序用，不作为伪精确综合分展示给用户。 */
export type AiEvaluation = {
  id: string;
  topicBucket: BriefingTopicBucket;
  informationValue: number; // 真实信息增量（非热门程度）
  learningValue: number; // 是否帮助建立 business/technology/product/investment sense 与 world model
  decisionValue: number; // 是否足以形成或修改一个明确判断
  novelty: number; // 是否提供了用户过去没有接触过的证据/机制/观点/反方论证
  sourceConfidence: number; // 信源可信度（结合 source_quality 与摘要充分度）
  whyWorthReading: string;
  keyQuestion: string; // 一个真正值得用户自己想的问题
  uncertainty: string;
  confidence: number; // AI 对本次评估自身的置信度
};

/** 最终条目的三层认知摘要：What happened / Why it matters / Question。 */
export type BriefingItemSummary = {
  whatHappened: string;
  whyItMatters: string;
  keyQuestion: string;
};

export type FeedCandidate = { clusterId: string; itemId: string; feedId: string; title: string; excerpt: string; url: string | null; publishedAt: string | null; firstSeenAt: string; feedPriority: number; feedTitle: string; category?: string | null; personalPriority?: string | null; sourceQuality?: string | null; contentHash?: string | null; sourceReason?: string | null };
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
