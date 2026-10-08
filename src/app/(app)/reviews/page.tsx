import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarRange, Database } from "lucide-react";
import { completeDecisionReview } from "@/features/reviews/actions";
import { getReviewsDashboard } from "@/features/reviews/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";

export default async function ReviewsPage() {
  const data = await getReviewsDashboard();
  const byKey = new Map(data.reviews.map((review) => [review.review_key, review]));
  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader eyebrow="复盘" title="复盘" description="查看已有复盘与待复核决定。需要时再生成摘要或补充记录。" />



      {data.dueDecisions.length ? (
        <section className="mt-8 border-t border-[var(--separator)] pt-5">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.006em] text-[var(--text-primary)]">待复核决定</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">更新或反转仍需要你的明确确认。</p>
          <div className="mt-2.5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
            {data.dueDecisions.map((decision) => (
              <details key={decision.id} className="py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{decision.title}</p>
                    <p className="mt-0.5 text-[10.5px] text-[var(--text-secondary)]">计划复核：{String(decision.review_at).slice(0, 10)}</p>
                  </div>
                  <span className="text-[11.5px] font-medium text-[var(--accent)]">开始复核 →</span>
                </summary>
                <div className="mt-3.5 grid gap-3.5 border-l-2 border-[var(--border-strong)] pl-4 md:grid-cols-2">
                  <DecisionReviewForm decisionId={decision.id} outcome="keep" />
                  <DecisionReviewForm decisionId={decision.id} outcome="reverse" />
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9 border-t pt-6">
        <h2 className="font-semibold">最近复盘</h2>
        <div className="mt-3 divide-y border-y">
          {data.reviews.length ? (
            data.reviews.map((review) => {
              const sourceCount = review.review_sources?.[0]?.count ?? 0;
              return (
                <Link key={review.id} href={`/reviews/${review.id}`} className="group block py-3.5 outline-none transition-colors ui-transition focus-visible:ring-2 focus-visible:ring-ring/30">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium group-hover:text-[var(--accent)]">{review.title}</p>
                    <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{review.status === "completed" ? "已完成" : "草稿"}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-[12.5px] leading-5.5 text-[var(--text-secondary)]">{review.content_markdown || "尚未写下内容"}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)]">
                    <Database className="size-3.5" /> 基于 {sourceCount} 条 Personal OS 记录
                    {review.generated_with_ai ? " · 使用过 AI 草稿" : ""}
                  </p>
                </Link>
              );
            })
          ) : (
            <p className="py-8 text-[12.5px] text-[var(--text-secondary)]">还没有复盘。证据会帮助你从已经发生的记录开始。</p>
          )}
        </div>
      </section>
      <details className="mt-8 border-t border-[var(--separator)] pt-3"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-[var(--text-secondary)]">按需生成或补充复盘</summary><div className="mt-3 grid gap-2.5 md:grid-cols-2">
        <ReviewEntry
          href="/reviews/daily"
          icon={<CalendarDays className="size-5" />}
          title="每日复盘"
          period="今天"
          review={byKey.get(data.daily.key)}
        />
        <ReviewEntry
          href="/reviews/weekly"
          icon={<CalendarRange className="size-5" />}
          title="每周复盘"
          period="本周"
          review={byKey.get(data.weekly.key)}
        />
      </div></details>
    </section>
  );
}

function ReviewEntry({
  href,
  icon,
  title,
  period,
  review,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  period: string;
  review?: { status: string; completed_at: string | null };
}) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-[14px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-4 outline-none transition-[background-color,border-color,color] ui-transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-ring/30">
      <span className="flex size-9 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold tracking-[-0.006em]">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-[var(--text-secondary)]">{period} · {review?.status === "completed" ? "已有记录，可查看" : review ? "已有草稿，可查看" : "按需开始"}</span>
      </span>
      <ArrowRight className="size-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)]" />
    </Link>
  );
}

function DecisionReviewForm({ decisionId, outcome }: { decisionId: string; outcome: "keep" | "reverse" }) {
  return (
    <form action={async (formData) => { "use server"; await completeDecisionReview({ decisionId, outcome, content: formData.get("content"), newTitle: formData.get("new_title") || undefined, newDecisionText: formData.get("new_decision_text") || undefined, rationale: formData.get("rationale") || undefined }); }} className="grid content-start gap-2">
      <p className="text-sm font-medium">{outcome === "keep" ? "维持原决定" : "反转并记录新决定"}</p>
      <Textarea required name="content" placeholder="证据发生了什么变化？为什么维持或反转？" className="min-h-24" />
      {outcome === "reverse" ? <><Input required name="new_title" placeholder="新决定标题" /><Textarea required name="new_decision_text" placeholder="我现在决定……" className="min-h-20" /><Textarea name="rationale" placeholder="新决定的理由" /></> : null}
      <Button variant="outline" className="w-fit">确认{outcome === "keep" ? "维持" : "反转"}</Button>
    </form>
  );
}
