const ignored = new Set([
  "今天", "昨天", "最近", "这个", "那个", "一些", "一个", "然后", "但是", "因为", "所以", "可以", "应该",
  "自己", "已经", "还是", "没有", "需要", "进行", "时候", "内容", "笔记", "记录", "事情", "问题",
]);

export type TopicDocument = { id: string; title: string; content: string };
export type RecurringTopic = { topic: string; documentIds: string[]; occurrences: number };
export type TopicTrend = RecurringTopic & {
  recentCount: number;
  previousCount: number;
  trend: "emerging" | "warming" | "recurring" | "fading";
};

function tokens(document: TopicDocument) {
  const raw = `${document.title} ${document.content}`.toLocaleLowerCase();
  const latin = raw.match(/[a-z][a-z0-9+._-]{2,}/g) ?? [];
  const chineseRuns = raw.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const chinese = chineseRuns.flatMap((run) => {
    const parts = [run];
    for (let index = 0; index <= run.length - 2; index += 1) parts.push(run.slice(index, index + 2));
    for (let index = 0; index <= run.length - 3; index += 1) parts.push(run.slice(index, index + 3));
    return parts;
  });
  return new Set([...latin, ...chinese].filter((token) => !ignored.has(token) && token.length <= 12));
}

export function findRecurringTopics(documents: TopicDocument[], limit = 8): RecurringTopic[] {
  const index = new Map<string, Set<string>>();
  for (const document of documents) {
    for (const token of tokens(document)) {
      const ids = index.get(token) ?? new Set<string>();
      ids.add(document.id);
      index.set(token, ids);
    }
  }
  return [...index.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([topic, ids]) => ({ topic, documentIds: [...ids], occurrences: ids.size }))
    .sort((left, right) => right.occurrences - left.occurrences || right.topic.length - left.topic.length)
    .filter((item, index, all) => !all.slice(0, index).some((prior) => prior.topic.includes(item.topic) && prior.documentIds.every((id) => item.documentIds.includes(id))))
    .slice(0, limit);
}

export function recurrenceScoreForDocument(documentId: string, topics: RecurringTopic[]) {
  return topics.reduce((score, topic) => score + (topic.documentIds.includes(documentId) ? Math.min(18, topic.occurrences * 4) : 0), 0);
}

export function classifyTopicTrends(
  documents: Array<TopicDocument & { updatedAt: string }>,
  now = new Date(),
): TopicTrend[] {
  const topics = findRecurringTopics(documents, 12);
  const recentBoundary = now.getTime() - 7 * 86_400_000;
  const previousBoundary = now.getTime() - 21 * 86_400_000;
  return topics.map((topic) => {
    const topicDocuments = documents.filter(
      (document) =>
        topic.documentIds.includes(document.id) &&
        `${document.title} ${document.content}`.toLocaleLowerCase().includes(topic.topic),
    );
    const recentCount = topicDocuments.filter((document) => Date.parse(document.updatedAt) >= recentBoundary).length;
    const previousCount = topicDocuments.filter((document) => {
      const timestamp = Date.parse(document.updatedAt);
      return timestamp >= previousBoundary && timestamp < recentBoundary;
    }).length;
    const trend = recentCount >= 2 && previousCount === 0
      ? "emerging"
      : recentCount > previousCount
        ? "warming"
        : previousCount >= 2 && recentCount < previousCount
          ? "fading"
          : "recurring";
    return { ...topic, recentCount, previousCount, trend };
  });
}
