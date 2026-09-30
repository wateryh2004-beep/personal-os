import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Database, History } from "lucide-react";
import { ReviewProposals } from "@/components/reviews/review-proposals";
import { getReviewDetail } from "@/features/reviews/queries";
import type { ReviewStructuredData } from "@/features/reviews/types";

const sections: Array<[keyof ReviewStructuredData, string]> = [
  ["wins", "进展与收获"],
  ["changes", "发生的变化"],
  ["friction", "阻力与摩擦"],
  ["openLoops", "仍未解决"],
  ["lessons", "经验与认识"],
  ["nextFocus", "下一步重点"],
];

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const data = await getReviewDetail(reviewId);
  if (!data) notFound();
  const structured = data.review.structured_data;
  return (
    <section className="mx-auto max-w-4xl">
      <Link href="/reviews" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)]">
        <ArrowLeft className="size-4" /> Reviews
      </Link>
      <header className="mt-4 border-b border-[var(--separator)] pb-4.5">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[var(--accent)]">已完成复盘</p>
            <h1 className="mt-1 text-[26px] font-semibold leading-[1.1] tracking-[-0.042em] text-[var(--text-primary)]">{data.review.title}</h1>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              {data.review.completed_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.review.completed_at)) : "未标记完成时间"}
            </p>
          </div>
          <Link href={data.review.review_type === "decision" ? "/reviews" : `/reviews/${data.review.review_type}`} className="pressable h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)]">
            继续修正
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10.5px] text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1.5"><Database className="size-3.5" /> 基于 {data.sources.length} 条 Personal OS 记录</span>
          <span className="flex items-center gap-1.5"><History className="size-3.5" /> {data.versions.length} 个版本</span>
          {data.review.generated_with_ai ? <span className="flex items-center gap-1.5"><Bot className="size-3.5" /> 使用过 AI 草稿</span> : null}
        </div>
      </header>

      <div className="mt-5.5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_272px]">
        <main className="min-w-0 space-y-5.5">
          {sections.map(([key, title]) => {
            const values = structured[key];
            if (!Array.isArray(values) || !values.length) return null;
            return (
              <section key={key}>
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
                <ul className="mt-1 space-y-1.5 text-[12.5px] leading-5.5 text-[var(--text-secondary)]">
                  {values.map((value, index) => <li key={`${key}-${index}`} className="flex gap-2"><span className="text-[var(--separator)]">—</span><span>{value}</span></li>)}
                </ul>
              </section>
            );
          })}
          {structured.freeReflection ? (
            <section>
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">自由复盘</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-6 text-[var(--text-secondary)]">{structured.freeReflection}</p>
            </section>
          ) : null}
        </main>
        <aside className="border-l border-[var(--separator)] pl-4">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">来源</h2>
          <div className="mt-2.5 divide-y divide-[var(--separator)]">
            {data.sources.length ? data.sources.map((source) => (
              <Link key={source.id} href={source.href} className="block py-2 text-[12px] outline-none hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                <span className="line-clamp-2 font-medium">{source.title}</span>
                <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">{source.source_type} · {source.source_role}</span>
              </Link>
            )) : <p className="py-3 text-[11.5px] text-[var(--text-secondary)]">这个旧版本没有来源快照。</p>}
          </div>
          <h2 className="mt-5 text-[13px] font-semibold text-[var(--text-primary)]">版本历史</h2>
          <div className="mt-2.5 space-y-1.5">
            {data.versions.map((version) => (
              <div key={version.id} className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
                v{version.version_number} · {version.reason} · {new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(version.created_at))}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="mt-7">
        <ReviewProposals reviewId={reviewId} proposals={data.proposals} sources={data.sources} />
      </div>
    </section>
  );
}
