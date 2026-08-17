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
      <PageHeader eyebrow="PERSONAL OS" title="Reviews" description="从可验证记录开始复盘，再把真正长期有效的信息交给你确认。" />

      <div className="mt-7 grid gap-3 md:grid-cols-2">
        <ReviewEntry
          href="/reviews/daily"
          icon={<CalendarDays className="size-5" />}
          title="Daily Review"
          period="今天"
          review={byKey.get(data.daily.key)}
        />
        <ReviewEntry
          href="/reviews/weekly"
          icon={<CalendarRange className="size-5" />}
          title="Weekly Review"
          period="本周"
          review={byKey.get(data.weekly.key)}
        />
      </div>

      {data.dueDecisions.length ? (
        <section className="mt-9 border-t pt-6">
          <h2 className="font-semibold">待复核 Decisions</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">更新或反转仍需要你的明确确认。</p>
          <div className="mt-3 divide-y border-y">
            {data.dueDecisions.map((decision) => (
              <details key={decision.id} className="py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{decision.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">计划复核：{String(decision.review_at).slice(0, 10)}</p>
                  </div>
                  <span className="text-sm font-medium text-[var(--accent)]">开始复核 →</span>
                </summary>
                <div className="mt-4 grid gap-4 border-l-2 border-[var(--border-strong)] pl-4 md:grid-cols-2">
                  <DecisionReviewForm decisionId={decision.id} outcome="keep" />
                  <DecisionReviewForm decisionId={decision.id} outcome="reverse" />
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9 border-t pt-6">
        <h2 className="font-semibold">Recent Reviews</h2>
        <div className="mt-3 divide-y border-y">
          {data.reviews.length ? (
            data.reviews.map((review) => {
              const sourceCount = review.review_sources?.[0]?.count ?? 0;
              return (
                <Link key={review.id} href={`/reviews/${review.id}`} className="group block py-4 outline-none transition-colors ui-transition focus-visible:ring-2 focus-visible:ring-ring/30">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium group-hover:text-[var(--accent)]">{review.title}</p>
                    <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{review.status === "completed" ? "已完成" : "草稿"}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{review.content_markdown || "尚未写下内容"}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <Database className="size-3.5" /> 基于 {sourceCount} 条 Personal OS 记录
                    {review.generated_with_ai ? " · 使用过 AI 草稿" : ""}
                  </p>
                </Link>
              );
            })
          ) : (
            <p className="py-8 text-sm text-[var(--text-secondary)]">还没有复盘。Evidence 会帮助你从已经发生的记录开始。</p>
          )}
        </div>
      </section>
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
    <Link href={href} className="group flex items-center gap-4 rounded-[var(--radius-lg)] border bg-[var(--surface-canvas)] p-5 outline-none transition-[background-color,border-color,color] ui-transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-ring/30">
      <span className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-[var(--text-secondary)]">{period} · {review?.status === "completed" ? "已完成，可修正" : "尚未完成"}</span>
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
