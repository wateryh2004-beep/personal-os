import { notFound } from "next/navigation";
import type { BriefingJudgment } from "@/features/briefing/judgments";
import { getBriefingHistoryRun } from "@/features/briefing/queries";

const topicLabels: Record<string, string> = { ai_tech: "AI / TECH", business_startup: "BUSINESS", finance_investing: "INVESTING", economy_society: "ECONOMY", wildcard: "EXPLORE" };

export default async function BriefingHistoryRunPage({ params }: { params: Promise<{ briefingId: string }> }) {
  const { briefingId } = await params;
  const run = await getBriefingHistoryRun(briefingId);
  if (!run) notFound();
  const entries = run.entries as Array<Record<string, unknown> & { id: string; judgment: BriefingJudgment | null }>;
  return (
    <main>
      <header className="border-b pb-4">
        <h2 className="font-medium">{run.briefing.briefing_date} 的 Briefing</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">只读快照 · {run.briefing.selected_count} 条 · {run.briefing.status}</p>
      </header>
      <div className="mt-5 divide-y divide-[var(--border-subtle)]">
        {entries.map((entry) => {
          const rawItem = Array.isArray(entry.feed_items) ? entry.feed_items[0] : entry.feed_items;
          const item = (rawItem ?? {}) as { title?: string; url?: string | null; canonical_url?: string | null; feeds?: { title?: string } | Array<{ title?: string }> };
          const feed = item?.feeds ? (Array.isArray(item.feeds) ? item.feeds[0] : item.feeds) : undefined;
          const href = item?.canonical_url || item?.url;
          const metadata = entry.ranking_metadata as Record<string, unknown> | null | undefined;
          const ai = metadata?.ai && typeof metadata.ai === "object" ? (metadata.ai as Record<string, unknown>) : null;
          const topic = ai && typeof ai.topic_bucket === "string" ? topicLabels[ai.topic_bucket] : undefined;
          const whyItMatters = typeof ai?.why_it_matters === "string" && ai.why_it_matters ? ai.why_it_matters : null;
          const keyQuestion = typeof ai?.key_question === "string" && ai.key_question ? ai.key_question : null;
          const summary = typeof entry.summary === "string" && entry.summary ? entry.summary : null;
          const judgment = entry.judgment;
          return (
            <article key={entry.id} className="py-5">
              <p className="text-xs text-[var(--text-tertiary)]">{feed?.title ?? "未知来源"}{topic ? ` · ${topic}` : ""}</p>
              <h3 className="mt-1 font-medium">{item?.title ?? "未命名资讯"}</h3>
              {summary ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{summary}</p> : null}
              {whyItMatters ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">Why it matters · </span>{whyItMatters}</p> : null}
              {keyQuestion ? <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">「{keyQuestion}」</p> : null}
              {href ? <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">阅读原文</a> : null}
              <div className="mt-3 rounded-[var(--radius-md)] border-l-2 border-[var(--accent)] bg-[var(--surface-hover)] px-3 py-2.5">
                {judgment ? (
                  <>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">我的判断</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-primary)]">{judgment.decisionText}</p>
                    {judgment.confidence != null ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Confidence · {judgment.confidence}%</p> : null}
                    {judgment.falsificationCondition ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]"><span className="text-[var(--text-tertiary)]">反证条件 · </span>{judgment.falsificationCondition}</p> : null}
                    {judgment.reviewAt ? <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">回看日期 · {new Date(judgment.reviewAt).toLocaleDateString("zh-CN")}</p> : null}
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">未写下判断</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
