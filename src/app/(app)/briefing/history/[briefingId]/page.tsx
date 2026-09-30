import { notFound } from "next/navigation";
import type { BriefingJudgment } from "@/features/briefing/judgments";
import { getBriefingHistoryRun } from "@/features/briefing/queries";

const topicLabels: Record<string, string> = { ai_tech: "AI / 科技", business_startup: "商业", finance_investing: "投资", economy_society: "经济社会", wildcard: "探索" };

export default async function BriefingHistoryRunPage({ params }: { params: Promise<{ briefingId: string }> }) {
  const { briefingId } = await params;
  const run = await getBriefingHistoryRun(briefingId);
  if (!run) notFound();
  const entries = run.entries as Array<Record<string, unknown> & { id: string; judgment: BriefingJudgment | null }>;
  return (
    <main>
      <header className="border-b border-[var(--separator)] pb-3">
        <h2 className="text-[13.25px] font-semibold text-[var(--text-primary)]">{run.briefing.briefing_date} 的简报</h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">只读快照 · {run.briefing.selected_count} 条 · {run.briefing.status}</p>
      </header>
      <div className="mt-3.5 divide-y divide-[var(--separator)]">
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
            <article key={entry.id} className="py-4">
              <p className="text-[10.5px] text-[var(--text-tertiary)]">{feed?.title ?? "未知来源"}{topic ? ` · ${topic}` : ""}</p>
              <h3 className="mt-1 text-[13.25px] font-medium text-[var(--text-primary)]">{item?.title ?? "未命名资讯"}</h3>
              {summary ? <p className="mt-1 text-[12.25px] leading-5.5 text-[var(--text-secondary)]">{summary}</p> : null}
              {whyItMatters ? <p className="mt-1.5 text-[12.5px] leading-5.5 text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">为什么重要 · </span>{whyItMatters}</p> : null}
              {keyQuestion ? <p className="mt-1.5 text-[12.25px] leading-5.5 text-[var(--text-primary)]">「{keyQuestion}」</p> : null}
              {href ? <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10.5px] font-medium text-[var(--accent)] underline underline-offset-2">阅读原文</a> : null}
              <div className="mt-2.5 rounded-[9px] bg-[var(--surface-control)] px-3 py-2.5">
                {judgment ? (
                  <>
                    <p className="text-[10.5px] font-semibold text-[var(--text-secondary)]">我的判断</p>
                    <p className="mt-1 text-[12px] leading-5.5 text-[var(--text-primary)]">{judgment.decisionText}</p>
                    {judgment.confidence != null ? <p className="mt-1 text-[10.5px] text-[var(--text-secondary)]">置信度 · {judgment.confidence}%</p> : null}
                    {judgment.falsificationCondition ? <p className="mt-1 text-[10.5px] leading-5 text-[var(--text-secondary)]"><span className="text-[var(--text-tertiary)]">反证条件 · </span>{judgment.falsificationCondition}</p> : null}
                    {judgment.reviewAt ? <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">回看日期 · {new Date(judgment.reviewAt).toLocaleDateString("zh-CN")}</p> : null}
                  </>
                ) : (
                  <p className="text-[10.5px] text-[var(--text-tertiary)]">未写下判断</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
